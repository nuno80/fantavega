// src/app/api/leagues/[league-id]/players/[player-id]/response-action/route.ts
// API per gestire le azioni di risposta quando un utente viene superato in un'asta

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { markTimerCompleted } from "@/lib/db/services/response-timer.service";
import { notifySocketServer } from "@/lib/socket-emitter";

interface RouteContext {
  params: Promise<{
    "league-id": string;
    "player-id": string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    // Autenticazione
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parsing parametri
    const routeParams = await context.params;
    const leagueId = parseInt(routeParams["league-id"], 10);
    const playerId = parseInt(routeParams["player-id"], 10);
    
    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Parsing body
    const body = await request.json();
    const { action } = body; // 'abandon' o 'counter_bid'

    if (!action || !['abandon', 'counter_bid'].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Verifica partecipazione alla lega
    const participant = db.prepare(
      "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?"
    ).get(leagueId, user.id);

    if (!participant) {
      return NextResponse.json({ error: "Not a league participant" }, { status: 403 });
    }

    // Trova l'asta attiva
    const auction = db.prepare(`
      SELECT a.id, a.player_id, a.auction_league_id, a.current_highest_bid_amount,
             a.current_highest_bidder_id, a.status, p.name as player_name
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      WHERE a.auction_league_id = ? AND a.player_id = ? AND a.status = 'active'
    `).get(leagueId, playerId) as {
      id: number;
      player_id: number;
      auction_league_id: number;
      current_highest_bid_amount: number;
      current_highest_bidder_id: string;
      status: string;
      player_name: string;
    } | undefined;

    if (!auction) {
      return NextResponse.json({ error: "Auction not found or not active" }, { status: 404 });
    }

    // Verifica che l'utente abbia un timer di risposta attivo
    const responseTimer = db.prepare(
      "SELECT id FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ? AND status = 'pending'"
    ).get(auction.id, user.id) as { id: number } | undefined;

    if (!responseTimer) {
      return NextResponse.json({ error: "No active response timer found" }, { status: 400 });
    }

    if (action === 'abandon') {
      // Gestisci abbandono
      const now = Math.floor(Date.now() / 1000);
      const cooldownEnd = now + (48 * 3600); // 48 ore

      // Trova l'offerta dell'utente per sbloccare i crediti
      const userBid = db.prepare(`
        SELECT amount FROM bids 
        WHERE auction_id = ? AND user_id = ? 
        ORDER BY bid_time DESC LIMIT 1
      `).get(auction.id, user.id) as { amount: number } | undefined;

      db.transaction(() => {
        // Segna il timer come completato
        db.prepare(
          "UPDATE user_auction_response_timers SET status = 'action_taken' WHERE id = ?"
        ).run(responseTimer.id);

        // Sblocca i crediti dell'utente se aveva fatto un'offerta
        if (userBid) {
          db.prepare(
            "UPDATE league_participants SET locked_credits = locked_credits - ? WHERE league_id = ? AND user_id = ?"
          ).run(userBid.amount, leagueId, user.id);
        }

        // Aggiungi cooldown usando user_player_preferences (standardizzato)
        // Usa INSERT OR REPLACE per gestire tentativi multipli di abbandono
        db.prepare(
          "INSERT OR REPLACE INTO user_player_preferences (user_id, player_id, league_id, preference_type, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'cooldown', ?, ?, ?)"
        ).run(user.id, auction.player_id, leagueId, cooldownEnd, now, now);
      })();

      // Notifiche
      await notifySocketServer({
        room: `user-${user.id}`,
        event: 'auction-abandoned',
        data: {
          playerName: auction.player_name,
          cooldownHours: 48,
          reason: 'Abbandono volontario'
        }
      });

      await notifySocketServer({
        room: `league-${leagueId}`,
        event: 'user-abandoned-auction',
        data: {
          userId: user.id,
          playerId: auction.player_id,
          playerName: auction.player_name,
          reason: 'voluntary'
        }
      });

      return NextResponse.json({
        success: true,
        action: 'abandoned',
        message: `Hai abbandonato l'asta per ${auction.player_name}. Non potrai fare offerte per questo giocatore per 48 ore.`
      });

    } else if (action === 'counter_bid') {
      // Segna il timer come completato (l'utente procederà con un'offerta)
      await markTimerCompleted(auction.id, user.id);

      return NextResponse.json({
        success: true,
        action: 'counter_bid_ready',
        message: 'Timer disattivato. Procedi con la tua offerta.',
        currentBid: auction.current_highest_bid_amount
      });
    }

  } catch (error) {
    console.error('[RESPONSE_ACTION] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";