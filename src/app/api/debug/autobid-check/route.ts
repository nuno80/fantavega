import { NextRequest, NextResponse } from "next/server";

import { authorizeDebugRequest } from "@/lib/auth/debug-route";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const authorization = await authorizeDebugRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  const targetUserId = request.nextUrl.searchParams.get("userId") || authorization.userId;
  const leagueId = request.nextUrl.searchParams.get("leagueId");
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
  }

  try {
    const [participantResult, autoBidsResult, totalAutoBidResult] = await Promise.all([
      db.execute({
        sql: `SELECT user_id, league_id, locked_credits, current_budget
              FROM league_participants WHERE user_id = ? AND league_id = ?`,
        args: [targetUserId, leagueId],
      }),
      db.execute({
        sql: `SELECT ab.auction_id, ab.is_active, ab.created_at,
                     a.player_id, p.name AS player_name, a.status AS auction_status,
                     a.current_highest_bid_amount, a.auction_league_id
              FROM auto_bids ab
              JOIN auctions a ON ab.auction_id = a.id
              JOIN players p ON a.player_id = p.id
              WHERE ab.user_id = ? AND a.auction_league_id = ? AND ab.is_active = 1
              ORDER BY ab.created_at DESC`,
        args: [targetUserId, leagueId],
      }),
      db.execute({
        sql: `SELECT COALESCE(SUM(ab.max_amount), 0) AS total_auto_bid
              FROM auto_bids ab
              JOIN auctions a ON ab.auction_id = a.id
              WHERE ab.user_id = ? AND a.auction_league_id = ? AND ab.is_active = 1`,
        args: [targetUserId, leagueId],
      }),
    ]);
    const participant = participantResult.rows[0];
    const autoBids = autoBidsResult.rows;
    const totalAutoBid = Number(totalAutoBidResult.rows[0]?.total_auto_bid) || 0;
    const ghostAutoBids = autoBids.filter((bid) => bid.auction_status !== "active");

    return NextResponse.json({
      status: "success",
      data: {
        participant,
        autoBids,
        summary: {
          locked_credits_db: Number(participant?.locked_credits) || 0,
          total_auto_bid_calculated: totalAutoBid,
          difference: (Number(participant?.locked_credits) || 0) - totalAutoBid,
          active_auto_bids_count: autoBids.length,
          ghost_auto_bids_count: ghostAutoBids.length,
        },
        ghostAutoBids,
      },
    });
  } catch (error) {
    console.error("[DEBUG] Auto-bid inspection failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
