import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Debug endpoint per verificare auto-bid attivi e locked_credits
 * GET /api/debug/autobid-check?userId=xxx&leagueId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    // Solo per utenti autenticati
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const targetUserId = searchParams.get("userId") || clerkUserId;
    const leagueId = searchParams.get("leagueId");

    // 1. Verifica locked_credits per l'utente
    const participantQuery = leagueId
      ? `SELECT user_id, league_id, locked_credits, current_budget
         FROM league_participants
         WHERE user_id = ? AND league_id = ?`
      : `SELECT user_id, league_id, locked_credits, current_budget
         FROM league_participants
         WHERE user_id = ?`;

    const participantResult = await db.execute({
      sql: participantQuery,
      args: leagueId ? [targetUserId, leagueId] : [targetUserId],
    });
    const participant = participantResult.rows[0];

    // 2. Tutti gli auto-bid attivi per l'utente
    const autoBidsResult = await db.execute({
      sql: `SELECT
          ab.auction_id,
          ab.max_amount,
          ab.is_active,
          ab.created_at,
          a.player_id,
          p.name as player_name,
          a.status as auction_status,
          a.current_highest_bid_amount,
          a.auction_league_id
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        JOIN players p ON a.player_id = p.id
        WHERE ab.user_id = ?
          AND ab.is_active = 1
        ORDER BY ab.created_at DESC`,
      args: [targetUserId],
    });
    const autoBids = autoBidsResult.rows;

    // 3. Somma auto-bid attivi
    const totalAutoBid = autoBids.reduce(
      (sum: number, bid: Record<string, unknown>) => sum + (Number(bid.max_amount) || 0),
      0
    );

    // 4. Auto-bid "fantasma" (attivi ma asta non attiva)
    const ghostAutoBids = autoBids.filter(
      (bid: Record<string, unknown>) => bid.auction_status !== "active"
    );

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
    console.error("[DEBUG] Auto-bid check error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
