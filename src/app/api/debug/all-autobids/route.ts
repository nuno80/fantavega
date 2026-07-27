import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (user.publicMetadata?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_API !== "true") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const leagueId = request.nextUrl.searchParams.get("leagueId");
    if (!leagueId || !/^\d+$/.test(leagueId)) {
      return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
    }

    const autoBidsResult = await db.execute({
      sql: `SELECT ab.id, ab.auction_id, ab.user_id, ab.max_amount, ab.is_active,
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

    return NextResponse.json({
      status: "success",
      data: { leagueId, autoBids: autoBidsResult.rows, participants: participantsResult.rows },
    });
  } catch (error) {
    console.error("[DEBUG] all-autobids failed", error);
    return NextResponse.json({ status: "error", error: "Internal server error" }, { status: 500 });
  }
}
