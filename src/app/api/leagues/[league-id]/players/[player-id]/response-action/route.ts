import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { db } from "@/lib/db";
import { placeBidOnExistingAuction } from "@/lib/db/services/bid.service";
import { abandonAuction, markTimerCompleted } from "@/lib/db/services/response-timer.service";

export async function POST(request: Request, { params }: { params: Promise<{ "league-id": string; "player-id": string }> }) {
  try {
    const user = await currentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { "league-id": rawLeagueId, "player-id": rawPlayerId } = await params;
    if (!/^\d+$/.test(rawLeagueId) || !/^\d+$/.test(rawPlayerId)) return NextResponse.json({ error: "Invalid league or player ID" }, { status: 400 });
    const leagueId = Number(rawLeagueId);
    const playerId = Number(rawPlayerId);
    const role = typeof user.publicMetadata?.role === "string" ? user.publicMetadata.role : undefined;
    if (!(await hasLeagueAccess(user.id, leagueId, role))) return NextResponse.json({ error: "Non sei autorizzato ad accedere a questa lega" }, { status: 403 });

    const body = (await request.json()) as { action?: unknown };
    if (body.action !== "bid" && body.action !== "fold") return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    const now = Math.floor(Date.now() / 1000);
    const result = await db.execute({
      sql: `SELECT a.id, a.current_highest_bid_amount, a.current_highest_bidder_id, urt.id AS timer_id, upp.expires_at AS cooldown_ends_at
            FROM auctions a
            JOIN user_auction_response_timers urt ON urt.auction_id = a.id AND urt.user_id = ? AND urt.status = 'pending'
            LEFT JOIN user_player_preferences upp ON upp.user_id = ? AND upp.player_id = a.player_id AND upp.league_id = a.auction_league_id AND upp.preference_type = 'cooldown' AND upp.expires_at > ?
            WHERE a.auction_league_id = ? AND a.player_id = ? AND a.status = 'active'
            LIMIT 1`,
      args: [user.id, user.id, now, leagueId, playerId],
    });
    const auction = result.rows[0] as unknown as { id: number; current_highest_bid_amount: number; current_highest_bidder_id: string | null; timer_id: number; cooldown_ends_at: number | null } | undefined;
    if (!auction) return NextResponse.json({ error: "Asta non attiva o timer di risposta non disponibile" }, { status: 409 });
    if (auction.cooldown_ends_at && auction.cooldown_ends_at > now) return NextResponse.json({ error: "Cooldown attivo", timeRemaining: auction.cooldown_ends_at - now }, { status: 429 });

    if (body.action === "fold") {
      await abandonAuction(user.id, leagueId, playerId);
      return NextResponse.json({ success: true, message: "Asta abbandonata con successo" });
    }
    if (auction.current_highest_bidder_id === user.id) return NextResponse.json({ error: "Sei già il miglior offerente" }, { status: 409 });

    const bidResult = await placeBidOnExistingAuction({ leagueId, playerId, userId: user.id, bidAmount: auction.current_highest_bid_amount + 1, bidType: "manual" });
    await markTimerCompleted(auction.id, user.id);
    return NextResponse.json({ success: true, message: "Offerta piazzata con successo", newState: bidResult });
  } catch (error) {
    console.error("[API RESPONSE-ACTION] Error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to process response action" }, { status: 500 });
  }
}
