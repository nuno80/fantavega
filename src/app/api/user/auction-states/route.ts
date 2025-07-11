// src/app/api/user/auction-states/route.ts
// API per ottenere gli stati delle aste dell'utente

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { getUsersWithPendingResponse } from "@/lib/db/services/auction-states.service";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    // Autenticazione
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ottieni leagueId dalla query string
    const url = new URL(request.url);
    const leagueId = url.searchParams.get('leagueId');
    
    if (!leagueId) {
      return NextResponse.json({ error: "leagueId required" }, { status: 400 });
    }

    console.log(`[USER_AUCTION_STATES] Fetching states for user: ${user.id}, league: ${leagueId}`);

    // Ottieni tutti gli stati per l'utente in questa lega
    const userStates = db.prepare(`
      SELECT 
        a.id as auction_id,
        a.player_id,
        p.name as player_name,
        a.current_highest_bidder_id,
        a.current_highest_bid_amount,
        a.user_auction_states,
        urt.response_deadline
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
      WHERE a.auction_league_id = ? 
        AND a.status = 'active'
        AND (a.current_highest_bidder_id = ? OR a.user_auction_states LIKE '%"${user.id}"%')
    `).all(user.id, leagueId, user.id) as Array<{
      auction_id: number;
      player_id: number;
      player_name: string;
      current_highest_bidder_id: string;
      current_highest_bid_amount: number;
      user_auction_states: string;
      response_deadline: number | null;
    }>;

    const statesWithDetails = userStates.map(auction => {
      let userState = 'miglior_offerta'; // Default
      
      // Se sei il miglior offerente, sei sempre in stato 'miglior_offerta'
      if (auction.current_highest_bidder_id === user.id) {
        userState = 'miglior_offerta';
      } else {
        // Altrimenti controlla gli stati salvati
        try {
          const states = auction.user_auction_states ? JSON.parse(auction.user_auction_states) : {};
          userState = states[user.id] || 'miglior_offerta';
        } catch (e) {
          userState = 'miglior_offerta';
        }
      }

      return {
        auction_id: auction.auction_id,
        player_id: auction.player_id,
        player_name: auction.player_name,
        current_bid: auction.current_highest_bid_amount,
        user_state: userState,
        response_deadline: auction.response_deadline,
        time_remaining: auction.response_deadline ? Math.max(0, auction.response_deadline - Math.floor(Date.now() / 1000)) : null,
        is_highest_bidder: auction.current_highest_bidder_id === user.id
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