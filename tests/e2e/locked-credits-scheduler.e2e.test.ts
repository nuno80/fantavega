import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSchedulerLease: vi.fn(),
  releaseSchedulerLease: vi.fn(),
  processExpiredAuctionsAndAssignPlayers: vi.fn(),
  processExpiredComplianceTimers: vi.fn(),
  processExpiredResponseTimers: vi.fn(),
  reconcileLockedCreditsForActiveLeagues: vi.fn(),
  reapGhostSessions: vi.fn(),
}));

vi.mock("@/lib/db/services/scheduler-lease.service", () => ({
  acquireSchedulerLease: mocks.acquireSchedulerLease,
  releaseSchedulerLease: mocks.releaseSchedulerLease,
  renewSchedulerLease: vi.fn().mockResolvedValue({ renewed: true, expiresAt: 1 }),
  shouldRenewLease: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db/services/bid.service", () => ({
  processExpiredAuctionsAndAssignPlayers:
    mocks.processExpiredAuctionsAndAssignPlayers,
}));
vi.mock("@/lib/db/services/penalty.service", () => ({
  processExpiredComplianceTimers: mocks.processExpiredComplianceTimers,
}));
vi.mock("@/lib/db/services/response-timer.service", () => ({
  processExpiredResponseTimers: mocks.processExpiredResponseTimers,
}));
vi.mock("@/lib/db/services/locked-credits.service", () => ({
  reconcileLockedCreditsForActiveLeagues:
    mocks.reconcileLockedCreditsForActiveLeagues,
}));
vi.mock("@/lib/db/services/session.service", () => ({
  reapGhostSessions: mocks.reapGhostSessions,
}));
vi.mock("@/lib/db/services/event-outbox.service", () => ({
  dispatchOutboxEvents: vi.fn().mockResolvedValue(0),
}));

describe("locked-credit scheduler safety net", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.acquireSchedulerLease.mockResolvedValue({ ownerToken: "worker-1" });
    mocks.releaseSchedulerLease.mockResolvedValue(undefined);
    mocks.reapGhostSessions.mockResolvedValue(undefined);
    mocks.processExpiredAuctionsAndAssignPlayers.mockResolvedValue({
      processedCount: 0,
      failedCount: 0,
      errors: [],
    });
    mocks.processExpiredResponseTimers.mockResolvedValue(undefined);
    mocks.processExpiredComplianceTimers.mockResolvedValue(undefined);
    mocks.reconcileLockedCreditsForActiveLeagues.mockResolvedValue(0);
  });

  it("reconciles candidate leagues even when this cycle settles no auction", async () => {
    const { runManualProcessing } = await import("@/lib/scheduler");

    await runManualProcessing();

    expect(mocks.reconcileLockedCreditsForActiveLeagues).toHaveBeenCalledOnce();
  });
});
