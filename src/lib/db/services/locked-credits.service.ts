import type { Client } from "@libsql/client";

import { db } from "@/lib/db";

type SqlExecutor = Pick<Client, "execute">;
const LOCKED_CREDIT_RECONCILE_BATCH_SIZE = 25;

function pendingResponseExposureSql(
  leagueIdExpression: string,
  userIdExpression: string,
): string {
  return `
  COALESCE((
    SELECT SUM(
      MAX(
        COALESCE((
          SELECT ab.max_amount
          FROM auto_bids ab
          WHERE ab.auction_id = urt.auction_id
            AND ab.user_id = urt.user_id
          LIMIT 1
        ), 0),
        COALESCE((
          SELECT b.amount
          FROM bids b
          WHERE b.auction_id = urt.auction_id
            AND b.user_id = urt.user_id
          ORDER BY b.bid_time DESC, b.id DESC
          LIMIT 1
        ), 0)
      )
    )
    FROM user_auction_response_timers urt
    JOIN auctions a ON a.id = urt.auction_id
    WHERE a.auction_league_id = ${leagueIdExpression}
      AND urt.user_id = ${userIdExpression}
      AND urt.status = 'pending'
      AND a.status IN ('active', 'closing')
      AND NOT EXISTS (
        SELECT 1
        FROM auto_bids active_ab
        WHERE active_ab.auction_id = urt.auction_id
          AND active_ab.user_id = urt.user_id
          AND active_ab.is_active = TRUE
      )
      AND (
        a.current_highest_bidder_id IS NULL
        OR a.current_highest_bidder_id <> urt.user_id
      )
  ), 0)`;
}

export async function getUserAuctionLockedExposure(
  leagueId: number,
  userId: string,
  auctionId: number,
  executor: SqlExecutor = db,
): Promise<number> {
  assertLeagueId(leagueId);
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId must be a non-empty string");
  }
  if (!Number.isSafeInteger(auctionId) || auctionId <= 0) {
    throw new RangeError("auctionId must be a positive safe integer");
  }
  const result = await executor.execute({
    sql: `
      SELECT COALESCE(
        (
          SELECT ab.max_amount
          FROM auto_bids ab
          WHERE ab.auction_id = a.id
            AND ab.user_id = ?
            AND ab.is_active = TRUE
          LIMIT 1
        ),
        CASE
          WHEN a.current_highest_bidder_id = ?
          THEN a.current_highest_bid_amount
        END,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM user_auction_response_timers urt
            WHERE urt.auction_id = a.id
              AND urt.user_id = ?
              AND urt.status = 'pending'
          )
          THEN MAX(
            COALESCE((
              SELECT ab.max_amount
              FROM auto_bids ab
              WHERE ab.auction_id = a.id
                AND ab.user_id = ?
              LIMIT 1
            ), 0),
            COALESCE((
              SELECT b.amount
              FROM bids b
              WHERE b.auction_id = a.id
                AND b.user_id = ?
              ORDER BY b.bid_time DESC, b.id DESC
              LIMIT 1
            ), 0)
          )
        END,
        0
      ) AS locked_exposure
      FROM auctions a
      WHERE a.id = ?
        AND a.auction_league_id = ?
        AND a.status IN ('active', 'closing')
    `,
    args: [userId, userId, userId, userId, userId, auctionId, leagueId],
  });
  return (
    (result.rows[0] as unknown as { locked_exposure: number } | undefined)
      ?.locked_exposure || 0
  );
}

export const ACTIVE_EXPOSURE_SQL = `
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
  + ${pendingResponseExposureSql("lp.league_id", "lp.user_id")}
`;

function assertLeagueId(leagueId: number): void {
  if (!Number.isSafeInteger(leagueId) || leagueId <= 0) {
    throw new RangeError("leagueId must be a positive safe integer");
  }
}

function requireRowString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Expected non-empty string for ${field}`);
  }
  return value;
}

function requireRowNumber(value: unknown, field: string): number {
  if (value === null || value === undefined) {
    throw new TypeError(`Expected numeric value for ${field}`);
  }
  const parsed = typeof value === "bigint" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new TypeError(`Expected numeric value for ${field}`);
  }
  return parsed;
}

export interface LockedCreditMismatch {
  userId: string;
  storedLockedCredits: number;
  activeExposure: number;
}

/**
 * Ricalcola i locked_credits di un singolo utente dalla somma dell'esposizione
 * attiva (auto-bid attivi + offerte manuali vincenti senza auto-bid +
 * impegni delle aste con response timer ancora pending).
 * Idempotente; accetta tx per l'isolamento transazionale (v3.2).
 */
export async function recalcUserLockedCredits(
  leagueId: number,
  userId: string,
  executor: SqlExecutor = db
): Promise<number> {
  assertLeagueId(leagueId);
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TypeError("userId must be a non-empty string");
  }
  const result = await executor.execute({
    sql: `
      SELECT
        COALESCE(
          (SELECT SUM(ab.max_amount)
           FROM auto_bids ab
           JOIN auctions a ON ab.auction_id = a.id
           WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
          0
        ) +
        COALESCE(
          (SELECT SUM(a.current_highest_bid_amount)
           FROM auctions a
           LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
           WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
             AND ab.id IS NULL
             AND a.status IN ('active', 'closing')),
          0
        ) +
        ${pendingResponseExposureSql("?", "?")} as total_locked
    `,
    args: [leagueId, userId, userId, leagueId, userId, leagueId, userId],
  });
  return (
    (result.rows[0] as unknown as { total_locked: number } | undefined)
      ?.total_locked || 0
  );
}

/**
 * Read-only invariant check suitable for diagnostics and scheduler metrics.
 */
export async function findLockedCreditMismatchesForLeague(
  leagueId: number,
  executor: SqlExecutor = db
): Promise<LockedCreditMismatch[]> {
  assertLeagueId(leagueId);
  const result = await executor.execute({
    sql: `
      WITH participant_exposure AS (
        SELECT
          lp.user_id,
          lp.locked_credits,
          ${ACTIVE_EXPOSURE_SQL} AS active_exposure
        FROM league_participants lp
        WHERE lp.league_id = ?
      )
      SELECT user_id, locked_credits, active_exposure
      FROM participant_exposure
      WHERE locked_credits <> active_exposure
      ORDER BY user_id
    `,
    args: [leagueId],
  });

  return result.rows.map((row) => ({
    userId: requireRowString(row.user_id, "user_id"),
    storedLockedCredits: requireRowNumber(row.locked_credits, "locked_credits"),
    activeExposure: requireRowNumber(row.active_exposure, "active_exposure"),
  }));
}

/**
 * Rebuilds locked credits from the authoritative active-auction state.
 * This is intentionally idempotent and scoped to one league.
 */
export async function reconcileLockedCreditsForLeague(
  leagueId: number,
  executor: SqlExecutor = db
): Promise<number> {
  assertLeagueId(leagueId);
  const result = await executor.execute({
    sql: `
      UPDATE league_participants AS lp
      SET locked_credits = ${ACTIVE_EXPOSURE_SQL}
      WHERE lp.league_id = ?
    `,
    args: [leagueId],
  });
  return result.rowsAffected;
}

export async function reconcileLockedCreditsForActiveLeagues(): Promise<number> {
  const leagues = await db.execute({
    sql: `
      WITH participant_exposure AS (
        SELECT
          lp.league_id,
          lp.locked_credits,
          ${ACTIVE_EXPOSURE_SQL} AS active_exposure
        FROM league_participants lp
      )
      SELECT DISTINCT league_id AS auction_league_id
      FROM participant_exposure
      WHERE locked_credits <> active_exposure
      ORDER BY league_id
      LIMIT ?
    `,
    args: [LOCKED_CREDIT_RECONCILE_BATCH_SIZE],
  });
  let updated = 0;
  for (const row of leagues.rows) {
    const leagueId = requireRowNumber(
      row.auction_league_id,
      "auction_league_id"
    );
    assertLeagueId(leagueId);
    updated += await reconcileLockedCreditsForLeague(leagueId);
  }
  if (leagues.rows.length > 0) {
    console.info("[LOCKED_CREDITS_RECONCILE]", {
      mismatchedLeagues: leagues.rows.length,
      updatedParticipants: updated,
    });
  }
  return updated;
}
