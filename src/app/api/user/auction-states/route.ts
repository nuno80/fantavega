// src/app/api/user/auction-states/route.ts
// API per ottenere gli stati delle aste dell'utente e attivare i timer di risposta.
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { activateTimersForUser } from "@/lib/db/services/response-timer.service";
import { recordUserLogin } from "@/lib/db/services/session.service";

// Type per le righe restituite dalla query
interface AuctionStateRow {
  auction_id: number;
  player_id: number;
  player_name: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string;
  current_highest_bid_amount: number;
  response_deadline: number | null;
  activated_at: number | null;
  cooldown_ends_at: number | null;
}

export async function GET(request: Request) {
  try {
    console.log("[USER_AUCTION_STATES] API call started...");

    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const leagueId = url.searchParams.get("leagueId");
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required" },
        { status: 400 }
      );
    }

    console.log(
      `[USER_AUCTION_STATES] Processing for user: ${user.id}, league: ${leagueId}`
    );

    // **FASE 0: Registra login utente**
    try {
      await recordUserLogin(user.id);
    } catch (error) {
      console.error("[USER_AUCTION_STATES] Error recording login:", error);
      // Non bloccare la richiesta per errori di sessione
    }

    // **FASE 1: Attiva i timer pendenti per l'utente**
    // Questa è la logica chiave: il timer parte quando l'utente "vede" lo stato.
    await activateTimersForUser(user.id);

    // **FASE 2: Recupera lo stato di tutte le aste attive in cui l'utente è coinvolto**
    const now = Math.floor(Date.now() / 1000);

    const involvedAuctionsResult = await db.execute({
      sql: `
        SELECT
          a.id as auction_id,
          a.player_id,
          p.name as player_name,
          p.photo_url as player_photo_url,
          a.current_highest_bidder_id,
          a.current_highest_bid_amount,
          urt.response_deadline,
          urt.activated_at,
          upp.expires_at as cooldown_ends_at
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        -- Join per trovare le aste in cui l'utente ha fatto un'offerta
        JOIN bids b ON a.id = b.auction_id AND b.user_id = ?
        -- Join per ottenere il timer di risposta, se esiste
        LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
        -- Join per verificare il cooldown
        LEFT JOIN user_player_preferences upp ON a.player_id = upp.player_id AND upp.user_id = ? AND upp.league_id = a.auction_league_id AND upp.preference_type = 'cooldown' AND upp.expires_at > ?
        WHERE a.auction_league_id = ? AND a.status = 'active'
        GROUP BY a.id
      `,
      args: [user.id, user.id, user.id, now, leagueId]
    });

    // Conversione sicura da Row[] a AuctionStateRow[]
    const involvedAuctions: AuctionStateRow[] = involvedAuctionsResult.rows.map(row => ({
      auction_id: row.auction_id as number,
      player_id: row.player_id as number,
      player_name: row.player_name as string,
      player_photo_url: row.player_photo_url as string | null,
      current_highest_bidder_id: row.current_highest_bidder_id as string,
      current_highest_bid_amount: row.current_highest_bid_amount as number,
      response_deadline: row.response_deadline as number | null,
      activated_at: row.activated_at as number | null,
      cooldown_ends_at: row.cooldown_ends_at as number | null,
    }));

    const statesWithDetails = involvedAuctions.map((auction) => {
      let user_state: string;
      const isHighestBidder = auction.current_highest_bidder_id === user.id;
      const isInCooldown =
        auction.cooldown_ends_at && auction.cooldown_ends_at > now;

      if (isInCooldown) {
        user_state = "asta_abbandonata";
      } else if (isHighestBidder) {
        user_state = "miglior_offerta";
      } else {
        // Se non è il migliore offerente e non è in cooldown, deve rispondere
        user_state = "rilancio_possibile";
      }

      return {
        auction_id: auction.auction_id,
        player_id: auction.player_id,
        player_name: auction.player_name,
        player_photo_url: auction.player_photo_url,
        current_bid: auction.current_highest_bid_amount,
        user_state: user_state,
        response_deadline: auction.response_deadline,
        time_remaining: auction.response_deadline
          ? Math.max(0, auction.response_deadline - now)
          : null,
        is_highest_bidder: isHighestBidder,
      };
    });

    console.log(
      `[USER_AUCTION_STATES] Returning ${statesWithDetails.length} auction states for user ${user.id}`
    );

    return NextResponse.json({
      states: statesWithDetails,
      count: statesWithDetails.length,
    });
  } catch (error) {
    console.error("[USER_AUCTION_STATES] API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
