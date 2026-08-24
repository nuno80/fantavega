import { NextRequest, NextResponse } from "next/server";

import { authorizeDebugRequest } from "@/lib/auth/debug-route";
import { db } from "@/lib/db";
import {
  DEBUG_PARTICIPANT_FIELDS,
  projectDebugRows,
} from "@/lib/http/debug-response";
import { createAdminAuditRecorder } from "@/lib/security/admin-audit";

const AUTO_BID_FIELDS = [
  "id",
  "auction_id",
  "user_id",
  "is_active",
  "created_at",
  "player_id",
  "player_name",
  "auction_status",
  "current_highest_bid_amount",
  "auction_league_id",
] as const;

export async function GET(request: NextRequest) {
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
    resource: "debug/all-autobids",
  });

  try {
    const leagueId = request.nextUrl.searchParams.get("leagueId");
    if (!leagueId || !/^\d+$/.test(leagueId)) {
      audit("failure");
      return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
    }

    const autoBidsResult = await db.execute({
      sql: `SELECT ab.id, ab.auction_id, ab.user_id, ab.is_active,
          ab.created_at, a.player_id, p.name as player_name,
          a.status as auction_status, a.current_highest_bid_amount,
          a.auction_league_id
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ? AND ab.is_active = 1
        ORDER BY ab.created_at DESC`,
      args: [leagueId],
    });

    const participantsResult = await db.execute({
      sql: `SELECT lp.user_id, lp.league_id, lp.locked_credits, lp.current_budget
        FROM league_participants lp WHERE lp.league_id = ?`,
      args: [leagueId],
    });

    const response = NextResponse.json({
      status: "success",
      data: {
        leagueId,
        autoBids: projectDebugRows(autoBidsResult.rows, AUTO_BID_FIELDS),
        participants: projectDebugRows(
          participantsResult.rows,
          DEBUG_PARTICIPANT_FIELDS,
        ),
      },
    });
    audit("success");
    return response;
  } catch (error) {
    audit("failure");
    console.error("[DEBUG] all-autobids failed", error);
    return NextResponse.json({ status: "error", error: "Internal server error" }, { status: 500 });
  }
}
