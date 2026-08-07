import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));

describe("atomic auction settlement claim", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the claimed auction only when the conditional update wins", async () => {
    execute.mockResolvedValueOnce({ rows: [{ auction_id: 7, league_id: 2, player_id: 9, winner_id: "user-a", amount: 42 }] });
    const { claimExpiredAuction } = await import("@/lib/db/services/auction-settlement-claim.service");
    await expect(claimExpiredAuction(7, 1_000)).resolves.toEqual({ auctionId: 7, leagueId: 2, playerId: 9, winnerId: "user-a", amount: 42 });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: [1_000, 7, 1_000] }));
  });

  it("returns null when another worker already claimed the auction", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    const { claimExpiredAuction } = await import("@/lib/db/services/auction-settlement-claim.service");
    await expect(claimExpiredAuction(7, 1_000)).resolves.toBeNull();
  });
});
