import { db } from "@/lib/db";

// Keep this aligned with the business limit enforced by penalty.service.ts.
const MAX_COMPLIANCE_PENALTIES_PER_CYCLE = 5;
const COMPLIANCE_GRACE_PERIOD_SECONDS = 60 * 60;

/**
 * Cheap, indexed preflight used by the scheduler before taking the distributed
 * lease. False positives are safe (the processors re-check atomically), while
 * avoiding the lease entirely when the application is idle saves two writes.
 */
export async function hasDueBackgroundWork(
  now = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const complianceCutoff = now - COMPLIANCE_GRACE_PERIOD_SECONDS;
  const result = await db.execute({
    sql: `
      SELECT 1 AS has_work
      WHERE EXISTS (
        SELECT 1
        FROM auctions a
        WHERE a.status IN ('active', 'closing')
          AND a.scheduled_end_time <= ?
          AND a.current_highest_bidder_id IS NOT NULL
          AND a.current_highest_bid_amount > 0
      ) OR EXISTS (
        SELECT 1
        FROM user_auction_response_timers urt
        JOIN auctions a ON a.id = urt.auction_id
        WHERE urt.status = 'pending'
          AND urt.response_deadline IS NOT NULL
          AND urt.response_deadline <= ?
          AND a.status = 'active'
      ) OR EXISTS (
        SELECT 1
        FROM user_league_compliance_status ulcs
        JOIN auction_leagues al ON al.id = ulcs.league_id
        WHERE ulcs.compliance_timer_start_at IS NOT NULL
          AND ulcs.compliance_timer_start_at <= ?
          AND al.status = 'draft_active'
          AND (
            ulcs.last_penalty_applied_for_hour_ending_at IS NULL
            OR ulcs.last_penalty_applied_for_hour_ending_at <= ?
          )
          AND ulcs.penalties_applied_this_cycle < ?
          AND ulcs.phase_identifier = (
            al.status || '_' ||
            CASE
              WHEN al.active_auction_roles IS NULL
                OR al.active_auction_roles = ''
                OR UPPER(al.active_auction_roles) = 'ALL'
              THEN 'ALL_ROLES'
              ELSE REPLACE(REPLACE(REPLACE(REPLACE(
                UPPER(al.active_auction_roles),
                ' ', ''
              ), 'A,C,D,P', 'A,C,D,P'), 'P,D,C,A', 'A,C,D,P'), 'D,C,A,P', 'A,C,D,P')
            END
          )
      )
      LIMIT 1
    `,
    args: [
      now,
      now,
      complianceCutoff,
      complianceCutoff,
      MAX_COMPLIANCE_PENALTIES_PER_CYCLE,
    ],
  });

  return result.rows.length > 0;
}
