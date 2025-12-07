import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint per vedere TUTTI gli auto-bid nella lega
 * GET /api/debug/all-autobids?leagueId=1
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const leagueId = searchParams.get("leagueId") || "1";

    // Tutti gli auto-bid attivi nella lega
    const autoBidsResult = await db.execute({
      sql: `SELECT
          ab.id,
          ab.auction_id,
          ab.user_id,
          ab.max_amount,
          ab.is_active,
          ab.created_at,
          a.player_id,
          p.name as player_name,
          a.status as auction_status,
          a.current_highest_bid_amount,
          a.auction_league_id,
          u.email as user_email
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        JOIN players p ON a.player_id = p.id
        LEFT JOIN users u ON ab.user_id = u.id
        WHERE a.auction_league_id = ?
          AND ab.is_active = 1
        ORDER BY ab.created_at DESC`,
      args: [leagueId],
    });

    // Tutti i partecipanti con locked_credits
    const participantsResult = await db.execute({
      sql: `SELECT
          lp.user_id,
          lp.league_id,
          lp.locked_credits,
          lp.current_budget,
          u.email as user_email
        FROM league_participants lp
        LEFT JOIN users u ON lp.user_id = u.id
        WHERE lp.league_id = ?`,
      args: [leagueId],
    });

    return NextResponse.json({
      status: "success",
      data: {
        leagueId,
        autoBids: autoBidsResult.rows,
        participants: participantsResult.rows,
        summary: {
          total_auto_bids: autoBidsResult.rows.length,
          total_participants: participantsResult.rows.length,
        },
      },
    });
  } catch (error) {
    console.error("[DEBUG] All auto-bids error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
