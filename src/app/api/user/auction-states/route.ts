// src/app/api/user/auction-states/route.ts
// API per ottenere gli stati delle aste dell'utente

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    console.log('[USER_AUCTION_STATES] Starting API call...');
    
    // Autenticazione
    const user = await currentUser();
    console.log('[USER_AUCTION_STATES] User check:', user?.id ? 'authenticated' : 'not authenticated');
    
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ottieni leagueId dalla query string
    const url = new URL(request.url);
    const leagueId = url.searchParams.get('leagueId');
    console.log('[USER_AUCTION_STATES] LeagueId from query:', leagueId);
    
    if (!leagueId) {
      return NextResponse.json({ error: "leagueId required" }, { status: 400 });
    }

    console.log(`[USER_AUCTION_STATES] Fetching states for user: ${user.id}, league: ${leagueId}`);

    // RESET RESPONSE TIMERS: Solo se non sono stati resettati di recente
    const now = Math.floor(Date.now() / 1000);
    const newDeadline = now + 3600; // 1 ora da ora
    
    const resetResult = db.prepare(`
      UPDATE user_auction_response_timers 
      SET response_deadline = ?, notified_at = ?, last_reset_at = ?
      WHERE user_id = ? 
        AND status = 'pending'
        AND auction_id IN (
          SELECT a.id 
          FROM auctions a 
          WHERE a.auction_league_id = ? AND a.status = 'active'
        )
        AND (
          last_reset_at IS NULL 
          OR notified_at > last_reset_at
        )
    `).run(newDeadline, now, now, user.id, leagueId);
    
    console.log(`[USER_AUCTION_STATES] Reset ${resetResult.changes} response timers to 1 hour for user ${user.id} (only new/updated timers)`);

    // Ottieni tutti gli stati per l'utente in questa lega
    const userStates = db.prepare(`
      SELECT 
        a.id as auction_id,
        a.player_id,
        p.name as player_name,
        a.current_highest_bidder_id,
        a.current_highest_bid_amount,
        urt.response_deadline
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
      WHERE a.auction_league_id = ? 
        AND a.status = 'active'
        AND a.current_highest_bidder_id = ?
    `).all(user.id, leagueId, user.id) as Array<{
      auction_id: number;
      player_id: number;
      player_name: string;
      current_highest_bidder_id: string;
      current_highest_bid_amount: number;
      response_deadline: number | null;
    }>;

    const statesWithDetails = userStates.map(auction => {
      // Dato che la query ora filtra solo per current_highest_bidder_id = user.id,
      // tutti i risultati sono aste dove l'utente è il miglior offerente
      return {
        auction_id: auction.auction_id,
        player_id: auction.player_id,
        player_name: auction.player_name,
        current_bid: auction.current_highest_bid_amount,
        user_state: 'miglior_offerta',
        response_deadline: auction.response_deadline,
        time_remaining: auction.response_deadline ? Math.max(0, auction.response_deadline - Math.floor(Date.now() / 1000)) : null,
        is_highest_bidder: true
      };
    });

    console.log(`[USER_AUCTION_STATES] Returning ${statesWithDetails.length} auction states:`, statesWithDetails);

    return NextResponse.json({
      states: statesWithDetails,
      count: statesWithDetails.length
    });

  } catch (error) {
    console.error('[USER_AUCTION_STATES] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";