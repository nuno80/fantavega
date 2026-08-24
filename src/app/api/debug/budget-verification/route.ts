import { NextResponse } from "next/server";

import { authorizeDebugRequest } from "@/lib/auth/debug-route";
import { db } from "@/lib/db";
import { projectDebugRows } from "@/lib/http/debug-response";
import { createAdminAuditRecorder } from "@/lib/security/admin-audit";

const PARTICIPANT_FIELDS = [
  "user_id",
  "manager_team_name",
  "disponibili",
  "bloccati",
  "iniziale",
  "spesi_calcolati",
] as const;
const TRANSACTION_FIELDS = [
  "user_id",
  "transaction_type",
  "amount",
  "description",
  "created_at",
  "balance_after_in_league",
] as const;
const ASSIGNMENT_FIELDS = ["user_id", "num_players", "total_spent"] as const;
const ACTIVE_AUCTION_FIELDS = ["user_id", "active_auctions", "locked_amount"] as const;
const PENALTY_FIELDS = ["user_id", "num_penalties", "total_penalties"] as const;

export async function GET(request: Request) {
  const authorization = await authorizeDebugRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  const audit = createAdminAuditRecorder({
    actorUserId: authorization.userId,
    action: "debug.read",
    resource: "debug/budget-verification",
  });

  const leagueId = new URL(request.url).searchParams.get("leagueId");
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    audit("failure");
    return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
  }

  try {
    const participantsResult = await db.execute({
      sql: `SELECT lp.user_id, lp.manager_team_name,
                   lp.current_budget AS disponibili, lp.locked_credits AS bloccati,
                   al.initial_budget_per_manager AS iniziale,
                   (al.initial_budget_per_manager - (lp.current_budget + lp.locked_credits)) AS spesi_calcolati
            FROM league_participants lp
            JOIN auction_leagues al ON lp.league_id = al.id
            WHERE lp.league_id = ? ORDER BY lp.user_id`,
      args: [leagueId],
    });
    const transactionsResult = await db.execute({
      sql: `SELECT user_id, transaction_type, amount, description, created_at, balance_after_in_league
            FROM budget_transactions WHERE league_id = ?
            ORDER BY user_id, created_at DESC LIMIT 100`,
      args: [leagueId],
    });
    const assignmentsResult = await db.execute({
      sql: `SELECT pa.user_id, COUNT(*) AS num_players, SUM(pa.purchase_price) AS total_spent
            FROM player_assignments pa WHERE pa.auction_league_id = ? GROUP BY pa.user_id`,
      args: [leagueId],
    });
    const activeAuctionsResult = await db.execute({
      sql: `SELECT a.current_highest_bidder_id AS user_id, COUNT(*) AS active_auctions,
                   SUM(a.current_highest_bid_amount) AS locked_amount
            FROM auctions a WHERE a.auction_league_id = ? AND a.status = 'active'
            GROUP BY a.current_highest_bidder_id`,
      args: [leagueId],
    });
    const penaltiesResult = await db.execute({
      sql: `SELECT user_id, COUNT(*) AS num_penalties, SUM(ABS(amount)) AS total_penalties
            FROM budget_transactions WHERE auction_league_id = ?
              AND transaction_type = 'penalty_requirement' GROUP BY user_id`,
      args: [leagueId],
    });

    const response = NextResponse.json({
      status: "success",
      leagueId,
      data: {
        participants: projectDebugRows(participantsResult.rows, PARTICIPANT_FIELDS),
        transactions: projectDebugRows(transactionsResult.rows, TRANSACTION_FIELDS),
        assignments: projectDebugRows(assignmentsResult.rows, ASSIGNMENT_FIELDS),
        activeAuctions: projectDebugRows(activeAuctionsResult.rows, ACTIVE_AUCTION_FIELDS),
        penalties: projectDebugRows(penaltiesResult.rows, PENALTY_FIELDS),
      },
    });
    audit("success");
    return response;
  } catch (error) {
    audit("failure");
    console.error("[DEBUG] Budget verification failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
