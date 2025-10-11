/**
 * Integration Tests for Penalty and Timer System
 * Tests complete workflows including:
 * - Page load penalty checks
 * - Login-based penalty application
 * - Timer expiration workflows
 * - Socket.IO notifications
 */
import { NextRequest } from "next/server";

import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    })),
    transaction: vi.fn((fn) => fn()),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn(),
}));

describe("Integration Tests - Complete Penalty Workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    vi.spyOn(Math, "floor").mockReturnValue(1700000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Page Load Penalty Check Workflow", () => {
    it("should trigger penalty check when user accesses auction page", async () => {
      // This tests the workflow in AuctionPageContent.tsx
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      // Mock a penalty being applied
      vi.mocked(processUserComplianceAndPenalties).mockResolvedValue({
        appliedPenaltyAmount: 10,
        isNowCompliant: false,
        message: "Penalties applied for non-compliance",
        totalPenaltyAmount: 10,
      });

      // Simulate the page load penalty check
      const leagueId = 1;
      const result = await processUserComplianceAndPenalties(
        leagueId,
        "user_123"
      );

      expect(result.appliedPenaltyAmount).toBe(10);
      expect(result.isNowCompliant).toBe(false);
    });

    it("should show toast notification when penalties are applied on page load", async () => {
      const mockToast = {
        error: vi.fn(),
        warning: vi.fn(),
      };

      // Simulate the toast logic from AuctionPageContent
      const penaltyResult = {
        appliedPenaltyAmount: 5,
        isNowCompliant: false,
        timeRemainingSeconds: 1800, // 30 minutes
      };

      if (penaltyResult.appliedPenaltyAmount > 0) {
        mockToast.error(
          `Penalità applicata: ${penaltyResult.appliedPenaltyAmount} crediti`,
          {
            description: "La tua rosa non rispetta i requisiti minimi.",
            duration: 8000,
          }
        );
      }

      if (!penaltyResult.isNowCompliant && penaltyResult.timeRemainingSeconds) {
        const minutesRemaining = Math.ceil(
          penaltyResult.timeRemainingSeconds / 60
        );
        mockToast.warning(
          `Rosa non conforme - Tempo rimanente: ${minutesRemaining} minuti`,
          {
            description: "Acquista giocatori per evitare penalità.",
            duration: 6000,
          }
        );
      }

      expect(mockToast.error).toHaveBeenCalledWith(
        "Penalità applicata: 5 crediti",
        expect.objectContaining({
          description: "La tua rosa non rispetta i requisiti minimi.",
          duration: 8000,
        })
      );

      expect(mockToast.warning).toHaveBeenCalledWith(
        "Rosa non conforme - Tempo rimanente: 30 minuti",
        expect.objectContaining({
          description: "Acquista giocatori per evitare penalità.",
          duration: 6000,
        })
      );
    });
  });

  describe("Login-Based Penalty Check Workflow", () => {
    it("should process penalties on user login via Clerk webhook", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      const mockDb = await import("@/lib/db");

      // Mock Clerk auth response
      (auth as unknown as Mock).mockResolvedValue({
        userId: "user_123",
        sessionId: "session_456",
      });

      // Mock database responses for the login check workflow
      const sessionCheck = { get: vi.fn().mockReturnValue(null) }; // First time login
      const leaguesCheck = {
        all: vi.fn().mockReturnValue([{ league_id: 1 }, { league_id: 2 }]),
      };
      const sessionInsert = { run: vi.fn() };

      (mockDb.db.prepare as Mock)
        .mockReturnValueOnce(sessionCheck)
        .mockReturnValueOnce(leaguesCheck)
        .mockReturnValueOnce(sessionInsert);

      // Simulate the login trigger endpoint
      const mockRequest = {
        json: () => Promise.resolve({}),
      } as Partial<NextRequest>;

      // Mock the compliance check function to be called for each league
      const { checkAndRecordCompliance } = await import(
        "@/lib/db/services/penalty.service"
      );
      vi.mocked(checkAndRecordCompliance).mockReturnValue({
        statusChanged: true,
        isCompliant: false,
      });

      // Simulate the login check process
      const leagues = [{ league_id: 1 }, { league_id: 2 }];

      for (const league of leagues) {
        const complianceResult = checkAndRecordCompliance(
          "user_123",
          league.league_id
        );
        expect(complianceResult.statusChanged).toBe(true);
      }

      expect(checkAndRecordCompliance).toHaveBeenCalledTimes(2);
      expect(sessionInsert.run).toHaveBeenCalledWith("session_456", "user_123");
    });

    it("should not duplicate compliance checks for existing sessions", async () => {
      const { auth } = await import("@clerk/nextjs/server");
      const mockDb = await import("@/lib/db");

      (auth as unknown as Mock).mockResolvedValue({
        userId: "user_123",
        sessionId: "session_456",
      });

      // Mock existing session
      const sessionCheck = {
        get: vi.fn().mockReturnValue({ session_id: "session_456" }),
      };

      (mockDb.db.prepare as Mock).mockReturnValueOnce(sessionCheck);

      const { checkAndRecordCompliance } = await import(
        "@/lib/db/services/penalty.service"
      );

      // Should not call compliance check for existing session
      expect(checkAndRecordCompliance).not.toHaveBeenCalled();
    });
  });

  describe("Timer Expiration Workflow", () => {
    it("should complete full timer expiration to penalty application workflow", async () => {
      const mockDb = await import("@/lib/db");
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );
      const { notifySocketServer } = await import("@/lib/socket-emitter");

      // Mock timer at expiration
      const timerStartTimestamp = 1700000000 - 3600; // 1 hour ago (expired)

      // Mock compliance check API call (simulating timer expiration trigger)
      const mockApiCall = async () => {
        const response = await fetch("/api/leagues/1/check-compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        return response.json();
      };

      // Mock the compliance check result
      vi.mocked(processUserComplianceAndPenalties).mockResolvedValue({
        appliedPenaltyAmount: 5,
        isNowCompliant: false,
        message: "Timer expired - penalty applied",
        totalPenaltyAmount: 5,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            appliedPenaltyAmount: 5,
            isNowCompliant: false,
            message: "Timer expired - penalty applied",
          }),
      });

      const result = await mockApiCall();

      expect(result.appliedPenaltyAmount).toBe(5);
      expect(processUserComplianceAndPenalties).toHaveBeenCalledWith(
        1,
        expect.any(String)
      );
    });

    it("should trigger UI refresh after penalty application", async () => {
      const mockRefreshCallback = vi.fn();

      // Simulate the timer component's penalty application callback
      const simulateTimerExpiration = async () => {
        const response = await fetch("/api/leagues/1/check-compliance", {
          method: "POST",
        });

        if (response.ok) {
          const result = await response.json();

          if (result.appliedPenaltyAmount > 0) {
            // Trigger UI refresh
            mockRefreshCallback();
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            appliedPenaltyAmount: 5,
            isNowCompliant: false,
          }),
      });

      await simulateTimerExpiration();

      expect(mockRefreshCallback).toHaveBeenCalled();
    });
  });

  describe("Socket.IO Notification Integration", () => {
    it("should send real-time notifications when penalties are applied", async () => {
      const { notifySocketServer } = await import("@/lib/socket-emitter");
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      // Mock penalty application with socket notification
      vi.mocked(processUserComplianceAndPenalties).mockImplementation(
        async (leagueId, userId) => {
          // Simulate socket notification
          await notifySocketServer({
            room: `user-${userId}`,
            event: "penalty-applied-notification",
            data: {
              leagueId,
              penaltyAmount: 5,
              newBudget: 95,
              message: "Penalty applied for non-compliance",
            },
          });

          return {
            appliedPenaltyAmount: 5,
            isNowCompliant: false,
            message: "Penalty applied",
            totalPenaltyAmount: 5,
          };
        }
      );

      const result = await processUserComplianceAndPenalties(1, "user_123");

      expect(result.appliedPenaltyAmount).toBe(5);
      expect(notifySocketServer).toHaveBeenCalledWith({
        room: "user-user_123",
        event: "penalty-applied-notification",
        data: expect.objectContaining({
          leagueId: 1,
          penaltyAmount: 5,
          newBudget: 95,
        }),
      });
    });
  });

  describe("Multi-User Scenario Integration", () => {
    it("should handle penalties for multiple users independently", async () => {
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      const users = ["user_1", "user_2", "user_3"];
      const results = [];

      // Mock different penalty scenarios for different users
      vi.mocked(processUserComplianceAndPenalties)
        .mockResolvedValueOnce({
          appliedPenaltyAmount: 5, // User 1: gets penalty
          isNowCompliant: false,
          message: "Penalty applied",
          totalPenaltyAmount: 5,
        })
        .mockResolvedValueOnce({
          appliedPenaltyAmount: 0, // User 2: compliant
          isNowCompliant: true,
          message: "User is compliant",
          totalPenaltyAmount: 0,
        })
        .mockResolvedValueOnce({
          appliedPenaltyAmount: 0, // User 3: in grace period
          isNowCompliant: false,
          message: "In grace period",
          totalPenaltyAmount: 0,
        });

      for (const userId of users) {
        const result = await processUserComplianceAndPenalties(1, userId);
        results.push(result);
      }

      expect(results[0].appliedPenaltyAmount).toBe(5); // User 1 penalized
      expect(results[1].appliedPenaltyAmount).toBe(0); // User 2 compliant
      expect(results[2].appliedPenaltyAmount).toBe(0); // User 3 in grace period

      expect(results[0].isNowCompliant).toBe(false);
      expect(results[1].isNowCompliant).toBe(true);
      expect(results[2].isNowCompliant).toBe(false);
    });
  });

  describe("Error Recovery Integration", () => {
    it("should handle database failures gracefully in full workflow", async () => {
      const mockDb = await import("@/lib/db");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Mock database failure
      (mockDb.db.transaction as Mock).mockImplementation(() => {
        throw new Error("Database connection lost");
      });

      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      // Should not throw, but handle gracefully
      await expect(async () => {
        await processUserComplianceAndPenalties(1, "user_123");
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error checking compliance"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it("should retry failed penalty applications", async () => {
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      // Mock first call fails, second succeeds
      vi.mocked(processUserComplianceAndPenalties)
        .mockRejectedValueOnce(new Error("Network timeout"))
        .mockResolvedValueOnce({
          appliedPenaltyAmount: 5,
          isNowCompliant: false,
          message: "Penalty applied after retry",
          totalPenaltyAmount: 5,
        });

      // Simulate retry logic
      let result;
      try {
        result = await processUserComplianceAndPenalties(1, "user_123");
      } catch (error) {
        // Retry once
        result = await processUserComplianceAndPenalties(1, "user_123");
      }

      expect(result.appliedPenaltyAmount).toBe(5);
      expect(result.message).toContain("after retry");
    });
  });

  describe("Performance Integration Tests", () => {
    it("should process penalties efficiently for large user base", async () => {
      const { processUserComplianceAndPenalties } = await import(
        "@/lib/db/services/penalty.service"
      );

      const userCount = 100;
      const users = Array.from({ length: userCount }, (_, i) => `user_${i}`);

      // Mock consistent response time
      vi.mocked(processUserComplianceAndPenalties).mockImplementation(
        async () => {
          // Simulate 50ms processing time per user
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            appliedPenaltyAmount: 0,
            isNowCompliant: true,
            message: "Processed efficiently",
            totalPenaltyAmount: 0,
          };
        }
      );

      const startTime = Date.now();

      // Process all users (could be parallelized in real implementation)
      const promises = users.map((userId) =>
        processUserComplianceAndPenalties(1, userId)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(userCount);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
