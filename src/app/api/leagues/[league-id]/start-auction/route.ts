// src/app/api/leagues/[league-id]/start-auction/route.ts
// API endpoint for admins to start an auction for a player

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { placeInitialBidAndCreateAuction } from "@/lib/db/services/bid.service";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Check if user is admin or manager
    const userRole = user.publicMetadata?.role as string || "manager";
    
    if (userRole !== "admin" && userRole !== "manager") {
      return NextResponse.json({ error: "Solo gli admin e i manager possono avviare aste" }, { status: 403 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);
    
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "ID lega non valido" }, { status: 400 });
    }

    // If user is a manager, check if they are a participant in this league
    if (userRole === "manager") {
      const participation = db
        .prepare("SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?")
        .get(leagueId, user.id);
      
      if (!participation) {
        return NextResponse.json({ error: "Solo i partecipanti alla lega possono avviare aste" }, { status: 403 });
      }
    }

    const requestBody = await request.json();
    const { playerId, initialBid } = requestBody;

    if (!playerId || isNaN(parseInt(playerId))) {
      return NextResponse.json({ error: "ID giocatore non valido" }, { status: 400 });
    }

    // Validate initial bid
    const bidAmount = initialBid ? parseInt(initialBid) : null;
    if (bidAmount !== null && (isNaN(bidAmount) || bidAmount < 1)) {
      return NextResponse.json({ error: "Offerta iniziale non valida" }, { status: 400 });
    }

    // Verify league exists and is in correct status
    const league = db
      .prepare("SELECT id, status, min_bid, timer_duration_minutes, config_json FROM auction_leagues WHERE id = ?")
      .get(leagueId) as {
        id: number;
        status: string;
        min_bid: number;
        timer_duration_minutes: number;
        config_json: string;
      } | undefined;

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
      .prepare("SELECT id, name, current_quotation FROM players WHERE id = ?")
      .get(playerId) as {
        id: number;
        name: string;
        current_quotation: number;
      } | undefined;

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

    // Determine the minimum bid based on league configuration
    let minimumBid = league.min_bid; // Default fallback
    
    try {
      const config = JSON.parse(league.config_json);
      if (config.min_bid_rule === "player_quotation" && player.current_quotation > 0) {
        minimumBid = player.current_quotation;
      }
    } catch (error) {
      console.error("Error parsing league config_json:", error);
      // Use default min_bid if config parsing fails
    }
    
    // Start the auction with specified bid or calculated minimum bid using user as initial bidder
    const finalBidAmount = bidAmount || minimumBid;
    const auctionResult = await placeInitialBidAndCreateAuction(
      leagueId,
      playerId,
      user.id,
      finalBidAmount
    );

    return NextResponse.json({
      message: "Asta avviata con successo",
      auctionId: auctionResult.auction_id,
      playerId: auctionResult.player_id,
      initialBid: auctionResult.current_bid,
      scheduledEndTime: auctionResult.scheduled_end_time,
    });

  } catch (error) {
    
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