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
});