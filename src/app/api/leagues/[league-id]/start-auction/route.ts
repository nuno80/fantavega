// src/app/api/leagues/[league-id]/start-auction/route.ts
// API endpoint for admins to start an auction for a player
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { placeInitialBidAndCreateAuction } from "@/lib/db/services/bid.service";

// Interface for the request body
interface StartAuctionRequestBody {
  playerId: string;
  initialBid?: string | number;
}

// Request deduplication to prevent duplicate auction creation
const pendingRequests = new Map<string, Promise<NextResponse>>();
const REQUEST_TIMEOUT_MS = 5000; // 5 second timeout for pending requests

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  // Parse parameters early for deduplication
  const resolvedParams = await params;
  const leagueId = parseInt(resolvedParams["league-id"]);

  if (isNaN(leagueId)) {
    return NextResponse.json({ error: "ID lega non valido" }, { status: 400 });
  }

  const requestBody = await request.json();
  const { playerId } = requestBody;

  if (!playerId || isNaN(parseInt(playerId))) {
    return NextResponse.json(
      { error: "ID giocatore non valido" },
      { status: 400 }
    );
  }

  // Create deduplication key based on league and player
  const dedupeKey = `${leagueId}-${playerId}`;

  // Check if there's already a pending request for this auction
  if (pendingRequests.has(dedupeKey)) {
    console.warn(
      `[START_AUCTION] DUPLICATE REQUEST BLOCKED for league ${leagueId}, player ${playerId}`
    );
    return NextResponse.json(
      { error: "Un'altra richiesta per questo giocatore è già in corso" },
      { status: 409 }
    );
  }

  // Create promise for this request and store it
  const requestPromise = processAuctionRequest(leagueId, playerId, requestBody);
  pendingRequests.set(dedupeKey, requestPromise);

  // Set timeout to cleanup pending request
  setTimeout(() => {
    pendingRequests.delete(dedupeKey);
  }, REQUEST_TIMEOUT_MS);

  try {
    const result = await requestPromise;
    pendingRequests.delete(dedupeKey);
    return result;
  } catch (error) {
    pendingRequests.delete(dedupeKey);
    throw error;
  }
}

// Extracted auction processing logic
async function processAuctionRequest(
  leagueId: number,
  playerId: string,
  requestBody: StartAuctionRequestBody
) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Check if user is admin or manager
    const userRole = (user.publicMetadata?.role as string) || "manager";

    if (userRole !== "admin" && userRole !== "manager") {
      return NextResponse.json(
        { error: "Solo gli admin e i manager possono avviare aste" },
        { status: 403 }
      );
    }

    // If user is a manager, check if they are a participant in this league
    if (userRole === "manager") {
      const participationResult = await db.execute({
        sql: "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?",
        args: [leagueId, user.id],
      });
      const participation = participationResult.rows[0];

      if (!participation) {
        return NextResponse.json(
          { error: "Solo i partecipanti alla lega possono avviare aste" },
          { status: 403 }
        );
      }
    }

    const { initialBid } = requestBody;

    console.log(
      `[START_AUCTION] Request for league ${leagueId}, player ${playerId}:`,
      requestBody
    );

    // Validate initial bid
    const bidAmount = initialBid ? parseInt(String(initialBid)) : null;
    console.log(`[START_AUCTION] Parsed bidAmount: ${bidAmount}`);
    if (bidAmount !== null && (isNaN(bidAmount) || bidAmount < 1)) {
      return NextResponse.json(
        { error: "Offerta iniziale non valida" },
        { status: 400 }
      );
    }

    // Verify league exists and is in correct status
    const leagueResult = await db.execute({
      sql: "SELECT id, status, min_bid, timer_duration_minutes, config_json FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as
      | {
        id: number;
        status: string;
        min_bid: number;
        timer_duration_minutes: number;
        config_json: string;
      }
      | undefined;

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
    const playerResult = await db.execute({
      sql: "SELECT id, name, current_quotation FROM players WHERE id = ?",
      args: [parseInt(playerId)],
    });
    const player = playerResult.rows[0] as unknown as
      | {
        id: number;
        name: string;
        current_quotation: number;
      }
      | undefined;

    if (!player) {
      return NextResponse.json(
        { error: "Giocatore non trovato" },
        { status: 404 }
      );
    }

    // Check if player is already assigned
    const assignmentResult = await db.execute({
      sql: "SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?",
      args: [leagueId, parseInt(playerId)],
    });
    const assignment = assignmentResult.rows[0];

    if (assignment) {
      return NextResponse.json(
        { error: "Giocatore già assegnato" },
        { status: 400 }
      );
    }

    // ENHANCED: Double-check for existing auction with explicit logging
    const existingAuctionResult = await db.execute({
      sql: "SELECT id, status FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')",
      args: [leagueId, parseInt(playerId)],
    });
    const existingAuction = existingAuctionResult.rows[0] as unknown as
      | { id: number; status: string }
      | undefined;

    if (existingAuction) {
      console.warn(
        `[START_AUCTION] BLOCKED: Auction already exists for player ${playerId} (auction ID: ${existingAuction.id}, status: ${existingAuction.status})`
      );
      return NextResponse.json(
        { error: "Esiste già un'asta attiva per questo giocatore" },
        { status: 400 }
      );
    }

    // Determine the minimum bid based on league configuration
    let minimumBid = league.min_bid; // Default fallback

    console.log(
      `[START_AUCTION] Player: ${player.name}, QtA: ${player.current_quotation}`
    );
    console.log(`[START_AUCTION] League config: ${league.config_json}`);
    console.log(`[START_AUCTION] Initial minimumBid: ${minimumBid}`);

    try {
      const config = JSON.parse(league.config_json);
      console.log(`[START_AUCTION] Config parsed:`, config);
      if (
        config.min_bid_rule === "player_quotation" &&
        player.current_quotation > 0
      ) {
        minimumBid = player.current_quotation;
        console.log(
          `[START_AUCTION] Using player quotation as minimumBid: ${minimumBid}`
        );
      }
    } catch (error) {
      console.error("Error parsing league config_json:", error);
      // Use default min_bid if config parsing fails
    }

    console.log(`[START_AUCTION] bidAmount from request: ${bidAmount}`);
    console.log(`[START_AUCTION] Final minimumBid: ${minimumBid}`);

    // Start the auction with specified bid or calculated minimum bid using user as initial bidder
    const finalBidAmount = bidAmount || minimumBid;
    console.log(`[START_AUCTION] Final bid amount: ${finalBidAmount}`);

    console.log(
      `[START_AUCTION] Creating auction for player ${playerId} in league ${leagueId} with bid ${finalBidAmount}`
    );
    const auctionResult = await placeInitialBidAndCreateAuction(
      leagueId,
      parseInt(playerId),
      user.id,
      finalBidAmount
    );

    console.log(`[START_AUCTION] Auction created successfully:`, {
      auctionId: auctionResult.auction_id,
      playerId: auctionResult.player_id,
      initialBid: auctionResult.current_bid,
    });

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
      console.error(`[START_AUCTION] Error: ${error.message}`);

      // Handle database constraint violations specifically
      if (
        error.message.includes("Esiste già un'asta attiva per questo giocatore")
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`[START_AUCTION] Unknown error:`, error);
    return NextResponse.json(
      { error: "Errore nell'avviare l'asta" },
      { status: 500 }
    );
  }
}
