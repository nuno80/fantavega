/**
 * React Component Tests for ComplianceTimer
 * Tests the frontend timer component that displays compliance countdowns
 * and triggers penalty checks when timers expire
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComplianceTimer } from "@/components/auction/ComplianceTimer";

// Mock fetch globally
global.fetch = vi.fn();

// Mock toast notifications
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe("ComplianceTimer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render nothing when no timer is set", () => {
    render(<ComplianceTimer timerStartTimestamp={null} leagueId={1} />);

    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
  });

  it("should display countdown during grace period", () => {
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 1800; // 30 minutes ago

    // Mock Date.now to return consistent time
    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    // Should show 30:00 remaining (30 minutes)
    expect(screen.getByText("30:00")).toBeInTheDocument();
  });

  it("should show countdown to next penalty after grace period", () => {
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 7200; // 2 hours ago (past grace period)

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    // Should show countdown to next hourly penalty
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("should trigger penalty check when timer reaches 00:00", async () => {
    const mockFetch = fetch as Mock;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          appliedPenaltyAmount: 5,
          isNowCompliant: false,
          message: "Penalty applied",
        }),
    });

    const onPenaltyApplied = vi.fn();
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3599; // 59 minutes 59 seconds ago

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(
      <ComplianceTimer
        timerStartTimestamp={timerStart}
        leagueId={1}
        onPenaltyApplied={onPenaltyApplied}
      />
    );

    // Initially shows 00:01
    expect(screen.getByText("00:01")).toBeInTheDocument();

    // Advance timer by 1 second to trigger penalty check
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByText("00:00")).toBeInTheDocument();
    });

    // Should trigger API call
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/leagues/1/check-compliance",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    // Should call callback
    await waitFor(() => {
      expect(onPenaltyApplied).toHaveBeenCalled();
    });
  });

  it("should show error toast when penalty is applied", async () => {
    const { toast } = await import("sonner");
    const mockFetch = fetch as Mock;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          appliedPenaltyAmount: 5,
          isNowCompliant: false,
          message: "Penalty applied",
        }),
    });

    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3600; // Exactly at expiration

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Penalità applicata: 5 crediti",
        expect.objectContaining({
          description:
            "Il timer di compliance è scaduto e la rosa non è compliant.",
          duration: 8000,
        })
      );
    });
  });

  it("should not show notification if no penalty was applied", async () => {
    const { toast } = await import("sonner");
    const mockFetch = fetch as Mock;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          appliedPenaltyAmount: 0,
          isNowCompliant: true,
          message: "User is now compliant",
        }),
    });

    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3600;

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("should prevent duplicate penalty checks", async () => {
    const mockFetch = fetch as Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          appliedPenaltyAmount: 0,
          isNowCompliant: false,
          message: "Already processed",
        }),
    });

    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3600;

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    // Trigger multiple timer updates
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      // Should only call API once despite multiple timer ticks
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it("should handle API errors gracefully", async () => {
    const mockFetch = fetch as Mock;
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3600;

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Error checking compliance on timer expiration"
        ),
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });

  it("should reset state when timer is cleared", () => {
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 1800;

    vi.spyOn(Date, "now").mockReturnValue(now);

    const { rerender } = render(
      <ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />
    );

    // Initially shows timer
    expect(screen.getByText("30:00")).toBeInTheDocument();

    // Clear timer
    rerender(<ComplianceTimer timerStartTimestamp={null} leagueId={1} />);

    // Should not display anything
    expect(screen.queryByText(/:/)).not.toBeInTheDocument();
  });

  it("should show expired state with red pulsing animation", () => {
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 3600; // Expired

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    const timerElement = screen.getByText("00:00");
    expect(timerElement).toHaveClass("text-red-500", "animate-pulse");
    expect(timerElement).toHaveAttribute(
      "title",
      expect.stringContaining("Timer scaduto")
    );
  });

  it("should show active state with yellow text", () => {
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 1800; // Active (30 minutes remaining)

    vi.spyOn(Date, "now").mockReturnValue(now);

    render(<ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />);

    const timerElement = screen.getByText("30:00");
    expect(timerElement).toHaveClass("text-yellow-500");
    expect(timerElement).toHaveAttribute(
      "title",
      expect.stringContaining("Tempo rimanente per compliance")
    );
  });

  it("should cleanup interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const now = Date.now();
    const timerStart = Math.floor(now / 1000) - 1800;

    vi.spyOn(Date, "now").mockReturnValue(now);

    const { unmount } = render(
      <ComplianceTimer timerStartTimestamp={timerStart} leagueId={1} />
    );

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
