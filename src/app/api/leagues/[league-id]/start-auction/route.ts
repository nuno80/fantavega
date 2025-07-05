// src/app/api/leagues/[league-id]/start-auction/route.ts
// API endpoint for admins to start an auction for a player

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { placeInitialBidAndCreateAuction } from "@/lib/db/services/bid.service";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { "league-id": string } }
) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Check if user is admin
    const userRole = user.publicMetadata?.role as string;
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Solo gli admin possono avviare aste" }, { status: 403 });
    }

    const leagueId = parseInt(params["league-id"]);
    
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "ID lega non valido" }, { status: 400 });
    }

    const { playerId } = await request.json();

    if (!playerId || isNaN(parseInt(playerId))) {
      return NextResponse.json({ error: "ID giocatore non valido" }, { status: 400 });
    }

    // Verify league exists and is in correct status
    const league = db
      .prepare("SELECT id, status, min_bid, timer_duration_minutes FROM auction_leagues WHERE id = ?")
      .get(leagueId);

    if (!league) {
      return NextResponse.json({ error: "Lega non trovata" }, { status: 404 });
    }

    if (league.status !== "draft_active" && league.status !== "repair_active") {
      return NextResponse.json(
        { error: "La lega non è in uno stato che permette di avviare aste" },
        { status: 400 }
      );
    }

    // Check if player exists and is not already assigned or in auction
    const player = db
      .prepare("SELECT id, name FROM players WHERE id = ?")
      .get(playerId);

    if (!player) {
      return NextResponse.json({ error: "Giocatore non trovato" }, { status: 404 });
    }

    // Check if player is already assigned
    const assignment = db
      .prepare("SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?")
      .get(leagueId, playerId);

    if (assignment) {
      return NextResponse.json({ error: "Giocatore già assegnato" }, { status: 400 });
    }

    // Check if there's already an active auction for this player
    const existingAuction = db
      .prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')")
      .get(leagueId, playerId);

    if (existingAuction) {
      return NextResponse.json({ error: "Esiste già un'asta attiva per questo giocatore" }, { status: 400 });
    }

    // Start the auction with minimum bid using admin as initial bidder
    // Note: In a real scenario, you might want to create the auction without an initial bid
    // or use a system user. For now, we'll use the admin as the initial bidder.
    const auctionResult = await placeInitialBidAndCreateAuction(
      leagueId,
      playerId,
      user.id,
      league.min_bid
    );

    return NextResponse.json({
      message: "Asta avviata con successo",
      auctionId: auctionResult.auction_id,
      playerId: auctionResult.player_id,
      initialBid: auctionResult.current_bid,
      scheduledEndTime: auctionResult.scheduled_end_time,
    });

  } catch (error) {
    console.error("Error starting auction:", error);
    
    // Handle specific error messages from the bid service
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: "Errore nell'avviare l'asta" },
      { status: 500 }
    );
  }
}