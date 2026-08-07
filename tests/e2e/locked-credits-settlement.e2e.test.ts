import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));

describe("locked credits after settlement", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rebuilds credits from active auto-bids and winning manual bids", async () => {
    execute.mockResolvedValue({ rowsAffected: 2, rows: [] });
    const { reconcileLockedCreditsForLeague } = await import("@/lib/db/services/locked-credits.service");
    await expect(reconcileLockedCreditsForLeague(7)).resolves.toBe(2);
    const query = execute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(query.args).toEqual([7]);
    expect(query.sql).toContain("a.status IN ('active', 'closing')");
    expect(query.sql).toContain("ab.max_amount");
    expect(query.sql).toContain("a.current_highest_bid_amount");
  });

  it("is idempotent when settlement already released the bid", async () => {
    execute.mockResolvedValueOnce({ rows: [{ auction_league_id: 7 }] }).mockResolvedValueOnce({ rowsAffected: 2, rows: [] });
    const { reconcileLockedCreditsForActiveLeagues } = await import("@/lib/db/services/locked-credits.service");
    await expect(reconcileLockedCreditsForActiveLeagues()).resolves.toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
