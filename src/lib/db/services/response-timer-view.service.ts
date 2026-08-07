import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

const RESPONSE_TIME_SECONDS = 60 * 60;

export type TimerViewResult =
  | { status: "activated"; auctionId: number; leagueId: number; deadline: number }
  | { status: "already_active" | "not_pending" | "not_found"; auctionId: number; leagueId: number };

/**
 * Activates exactly one pending response timer after the client confirms that
 * the relevant auction is visible. Presence/heartbeat must not call this.
 */
export async function activateResponseTimerForViewedAuction(
  userId: string,
  leagueId: number,
  auctionId: number,
  viewedAt = Math.floor(Date.now() / 1000),
): Promise<TimerViewResult> {
  const deadline = viewedAt + RESPONSE_TIME_SECONDS;
  const result = await db.execute({
    sql: `
      UPDATE user_auction_response_timers
      SET response_deadline = ?, activated_at = ?
      WHERE auction_id = ?
        AND user_id = ?
        AND status = 'pending'
        AND response_deadline IS NULL
        AND EXISTS (
          SELECT 1 FROM auctions
          WHERE auctions.id = user_auction_response_timers.auction_id
            AND auctions.auction_league_id = ?
            AND auctions.status = 'active'
        )
    `,
    args: [deadline, viewedAt, auctionId, userId, leagueId],
  });

  if (result.rowsAffected === 0) {
    const current = await db.execute({
      sql: `
        SELECT response_deadline
        FROM user_auction_response_timers
        WHERE auction_id = ? AND user_id = ?
          AND EXISTS (
            SELECT 1 FROM auctions
            WHERE auctions.id = user_auction_response_timers.auction_id
              AND auctions.auction_league_id = ?
          )
      `,
      args: [auctionId, userId, leagueId],
    });
    if (current.rows.length === 0) return { status: "not_found", auctionId, leagueId };
    return current.rows[0].response_deadline == null
      ? { status: "not_pending", auctionId, leagueId }
      : { status: "already_active", auctionId, leagueId };
  }

  await notifySocketServer({
    room: `user-${userId}`,
    event: "response-timer-started",
    data: { auctionId, leagueId, deadline, timeRemaining: Math.max(0, deadline - Math.floor(Date.now() / 1000)) },
  });
  return { status: "activated", auctionId, leagueId, deadline };
}
