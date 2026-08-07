import { db } from "@/lib/db";

/**
 * Rebuilds locked credits from the authoritative active-auction state.
 * This is intentionally idempotent and scoped to one league.
 */
export async function reconcileLockedCreditsForLeague(leagueId: number): Promise<number> {
  const result = await db.execute({
    sql: `
      UPDATE league_participants AS lp
      SET locked_credits =
        COALESCE((
          SELECT SUM(ab.max_amount)
          FROM auto_bids ab
          JOIN auctions a ON a.id = ab.auction_id
          WHERE a.auction_league_id = lp.league_id
            AND ab.user_id = lp.user_id
            AND ab.is_active = TRUE
            AND a.status IN ('active', 'closing')
        ), 0)
        + COALESCE((
          SELECT SUM(a.current_highest_bid_amount)
          FROM auctions a
          LEFT JOIN auto_bids ab
            ON ab.auction_id = a.id
           AND ab.user_id = lp.user_id
           AND ab.is_active = TRUE
          WHERE a.auction_league_id = lp.league_id
            AND a.current_highest_bidder_id = lp.user_id
            AND ab.id IS NULL
            AND a.status IN ('active', 'closing')
        ), 0)
      WHERE lp.league_id = ?
    `,
    args: [leagueId],
  });
  return result.rowsAffected;
}

export async function reconcileLockedCreditsForActiveLeagues(): Promise<number> {
  const leagues = await db.execute({
    sql: "SELECT DISTINCT auction_league_id FROM auctions WHERE status IN ('active', 'closing')",
    args: [],
  });
  let updated = 0;
  for (const row of leagues.rows) updated += await reconcileLockedCreditsForLeague(Number(row.auction_league_id));
  return updated;
}
