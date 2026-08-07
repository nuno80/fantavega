import { db } from "@/lib/db";

export interface SettlementClaim {
  auctionId: number;
  leagueId: number;
  playerId: number;
  winnerId: string;
  amount: number;
}

/**
 * Claims one expired auction for settlement. The conditional update is the
 * concurrency guard: exactly one worker can transition the auction.
 */
export async function claimExpiredAuction(
  auctionId: number,
  now = Math.floor(Date.now() / 1000),
): Promise<SettlementClaim | null> {
  const result = await db.execute({
    sql: `
      UPDATE auctions
      SET status = 'closing', updated_at = ?
      WHERE id = ?
        AND status = 'active'
        AND scheduled_end_time <= ?
        AND current_highest_bidder_id IS NOT NULL
        AND current_highest_bid_amount > 0
      RETURNING id AS auction_id,
        auction_league_id AS league_id,
        player_id,
        current_highest_bidder_id AS winner_id,
        current_highest_bid_amount AS amount
    `,
    args: [now, auctionId, now],
  });

  const row = result.rows[0];
  if (!row) return null;
  return {
    auctionId: Number(row.auction_id),
    leagueId: Number(row.league_id),
    playerId: Number(row.player_id),
    winnerId: String(row.winner_id),
    amount: Number(row.amount),
  };
}
