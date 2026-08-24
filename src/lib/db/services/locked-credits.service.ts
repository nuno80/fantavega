import { db } from "@/lib/db";
import type { Client } from "@libsql/client";

type SqlExecutor = Pick<Client, "execute">;
const LOCKED_CREDIT_RECONCILE_BATCH_SIZE = 25;

const ACTIVE_EXPOSURE_SQL = `
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
 * Read-only invariant check suitable for diagnostics and scheduler metrics.
 */
export async function findLockedCreditMismatchesForLeague(
  leagueId: number,
  executor: SqlExecutor = db,
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
  executor: SqlExecutor = db,
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
    const leagueId = requireRowNumber(row.auction_league_id, "auction_league_id");
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
