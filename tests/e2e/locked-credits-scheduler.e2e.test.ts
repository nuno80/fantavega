import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireSchedulerLease: vi.fn(),
  releaseSchedulerLease: vi.fn(),
  processExpiredAuctionsAndAssignPlayers: vi.fn(),
  processExpiredComplianceTimers: vi.fn(),
  processExpiredResponseTimers: vi.fn(),
  reconcileLockedCreditsForActiveLeagues: vi.fn(),
  reapGhostSessions: vi.fn(),
  hasDueBackgroundWork: vi.fn(),
}));

vi.mock("@/lib/db/services/scheduler-lease.service", () => ({
  acquireSchedulerLease: mocks.acquireSchedulerLease,
  releaseSchedulerLease: mocks.releaseSchedulerLease,
  renewSchedulerLease: vi
    .fn()
    .mockResolvedValue({ renewed: true, expiresAt: 1 }),
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
vi.mock("@/lib/db/services/scheduler-work.service", () => ({
  hasDueBackgroundWork: mocks.hasDueBackgroundWork,
}));
vi.mock("@/lib/db/services/event-outbox.service", () => ({
  dispatchOutboxEvents: vi.fn().mockResolvedValue(0),
}));

describe("locked-credit scheduler safety net", () => {
  beforeEach(() => {
    vi.resetModules();
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
    mocks.hasDueBackgroundWork.mockResolvedValue(true);
  });

  it("does not churn the distributed lease when no expiry work is due", async () => {
    const { runManualProcessing } = await import("@/lib/scheduler");

    // The first cycle initializes the slow reconciliation maintenance window.
    await runManualProcessing();
    vi.clearAllMocks();
    mocks.hasDueBackgroundWork.mockResolvedValue(false);

    await runManualProcessing();

    expect(mocks.acquireSchedulerLease).not.toHaveBeenCalled();
    expect(mocks.releaseSchedulerLease).not.toHaveBeenCalled();
    expect(mocks.processExpiredAuctionsAndAssignPlayers).not.toHaveBeenCalled();
    expect(mocks.processExpiredResponseTimers).not.toHaveBeenCalled();
    expect(mocks.processExpiredComplianceTimers).not.toHaveBeenCalled();
  });

  it("runs reconciliation as a slow safety net, not on every 15-second cycle", async () => {
    const { runManualProcessing } = await import("@/lib/scheduler");

    await runManualProcessing();
    await runManualProcessing();

    expect(mocks.reconcileLockedCreditsForActiveLeagues).toHaveBeenCalledOnce();
  });

  it("backs off empty outbox polling and resets after delivery", async () => {
    const { getNextOutboxDelay } = await import("@/lib/scheduler");

    expect(getNextOutboxDelay(0, 0)).toEqual({ delay: 2_000, emptyTicks: 1 });
    expect(getNextOutboxDelay(0, 1)).toEqual({ delay: 5_000, emptyTicks: 2 });
    expect(getNextOutboxDelay(0, 99)).toEqual({
      delay: 5_000,
      emptyTicks: 100,
    });
    expect(getNextOutboxDelay(1, 99)).toEqual({ delay: 1_000, emptyTicks: 0 });
  });
});
