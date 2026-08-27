import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));

describe("distributed scheduler lease", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    execute.mockResolvedValue({ rowsAffected: 1, rows: [] });
  });

  it("acquires a lease when the database accepts the claim", async () => {
    const { acquireSchedulerLease } = await import("@/lib/db/services/scheduler-lease.service");
    const lease = await acquireSchedulerLease(1_000);
    expect(lease?.expiresAt).toBe(1_045);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      sql: expect.stringContaining("ON CONFLICT(lease_name) DO UPDATE"),
      args: ["background-scheduler", expect.any(String), 1_045, 1_000],
    }));
  });

  it("does not run when another instance owns the lease", async () => {
    execute.mockResolvedValueOnce({ rowsAffected: 1, rows: [] }).mockResolvedValueOnce({ rowsAffected: 0, rows: [] });
    const { acquireSchedulerLease } = await import("@/lib/db/services/scheduler-lease.service");
    await expect(acquireSchedulerLease(1_000)).resolves.not.toBeNull();
    await expect(acquireSchedulerLease(1_001)).resolves.toBeNull();
  });

  it("releases only its own lease", async () => {
    const { releaseSchedulerLease } = await import("@/lib/db/services/scheduler-lease.service");
    await releaseSchedulerLease("owner-token");
    expect(execute).toHaveBeenLastCalledWith({
      sql: "DELETE FROM scheduler_leases WHERE lease_name = ? AND owner_token = ?",
      args: ["background-scheduler", "owner-token"],
    });
  });

  it("renews only the owner's lease (fenced)", async () => {
    const { renewSchedulerLease } = await import("@/lib/db/services/scheduler-lease.service");
    execute.mockResolvedValueOnce({ rowsAffected: 1, rows: [] });
    const renewal = await renewSchedulerLease("owner-token", 1_030);
    expect(renewal).toEqual({ renewed: true, expiresAt: 1_075 });
    expect(execute).toHaveBeenCalledWith({
      sql: expect.stringContaining("UPDATE scheduler_leases SET expires_at"),
      args: [1_075, "background-scheduler", "owner-token"],
    });

    // A renew by a stale owner token fails (fenced): no extension of a taken-over lease.
    execute.mockResolvedValueOnce({ rowsAffected: 0, rows: [] });
    const stale = await renewSchedulerLease("stale-token", 1_030);
    expect(stale).toEqual({ renewed: false, expiresAt: 1_075 });
  });

  it("flags renewal when within the half-TTL threshold", async () => {
    const { shouldRenewLease } = await import("@/lib/db/services/scheduler-lease.service");
    // Threshold = 22s (half of 45s TTL): renew when now >= expiresAt - 22.
    expect(shouldRenewLease(1_000, 977)).toBe(false); // 23s left, just above threshold
    expect(shouldRenewLease(1_000, 978)).toBe(true);  // 22s left, at threshold
    expect(shouldRenewLease(1_000, 1_000)).toBe(true);
  });
});