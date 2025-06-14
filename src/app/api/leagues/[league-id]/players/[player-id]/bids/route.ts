// src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts v.1.3
// API Route Handler per la gestione delle offerte (POST) e il recupero dello stato di un'asta (GET) per un giocatore specifico in una lega.
// 1. Importazioni e Definizioni di Interfaccia (INVARIATE)
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  type AuctionCreationResult,
  type ExistingAuctionBidResult,
  getAuctionStatusForPlayer,
  placeBidOnExistingAuction,
  placeInitialBidAndCreateAuction,
} from "@/lib/db/services/bid.service";

interface RouteContext {
  params: Promise<{
    "league-id": string;
    "player-id": string;
  }>;
}

interface PlaceBidRequestBody {
  amount: number;
  bid_type?: "manual" | "quick";
}

// 2. Funzione POST per Piazzare Offerte (MODIFICATO SOLO IL BLOCCO CATCH)
export async function POST(request: Request, context: RouteContext) {
  console.log(
    "!!!!!!!!!! POST HANDLER REACHED for /api/leagues/[league-id]/players/[player-id]/bids !!!!!!!!!!"
  );
  try {
    // 2.1. Autenticazione utente e parsing dei parametri dalla route (INVARIATO)
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: You must be logged in to place a bid." },
        { status: 401 }
      );
    }

    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const playerIdStr = routeParams["player-id"];

    const leagueIdNum = parseInt(leagueIdStr, 10);
    const playerIdNum = parseInt(playerIdStr, 10);

    if (isNaN(leagueIdNum) || isNaN(playerIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID or player ID format in URL." },
        { status: 400 }
      );
    }

    // 2.2. Parsing e validazione del corpo della richiesta (offerta) (INVARIATO)
    const body = (await request.json()) as PlaceBidRequestBody;
    const bidAmount = body.amount;
    const bidType = body.bid_type || "manual";

    if (bidType !== "manual" && bidType !== "quick") {
      return NextResponse.json(
        { error: "Invalid bid_type. Must be 'manual' or 'quick'." },
        { status: 400 }
      );
    }
    if (
      bidType === "manual" &&
      (typeof bidAmount !== "number" || bidAmount <= 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid bid amount for 'manual' bid. Amount must be a positive number.",
        },
        { status: 400 }
      );
    }
    if (
      bidType === "quick" &&
      body.amount !== undefined &&
      (typeof body.amount !== "number" || body.amount <= 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Amount for quick bid, if provided, should be positive or omitted.",
        },
        { status: 400 }
      );
    }

    console.log(
      `[API BIDS POST] User ${user.id} attempting bid of ${bidAmount} (type: ${bidType}) for player ${playerIdNum} in league ${leagueIdNum}`
    );

    // 2.3. Logica di offerta: determina se creare una nuova asta o fare un'offerta su una esistente (INVARIATO)
    const existingAuctionStatus = await getAuctionStatusForPlayer(
      leagueIdNum,
      playerIdNum
    );

    let result: AuctionCreationResult | ExistingAuctionBidResult;
    let httpStatus = 201;

    if (
      existingAuctionStatus &&
      (existingAuctionStatus.status === "active" ||
        existingAuctionStatus.status === "closing")
    ) {
      console.log(
        `[API BIDS POST] Active auction found (ID: ${existingAuctionStatus.id}). Placing bid on existing auction.`
      );
      result = await placeBidOnExistingAuction(
        existingAuctionStatus.id,
        user.id,
        bidAmount,
        bidType
      );
      httpStatus = 200;
      console.log(
        "[API BIDS POST] Bid placed on existing auction successfully. Result:",
        result
      );
    } else {
      console.log(
        "[API BIDS POST] No active auction found or auction not in biddable state. Placing initial bid to create auction."
      );
      if (bidType === "quick") {
        if (typeof bidAmount !== "number" || bidAmount <= 0) {
          return NextResponse.json(
            {
              error:
                "Quick bid on a new auction requires a valid positive amount (or will use league minimum).",
            },
            { status: 400 }
          );
        }
        console.warn(
          "[API BIDS POST] 'quick' bid type on a new auction; using provided amount as initial manual bid (will be checked against min_bid)."
        );
      }
      result = await placeInitialBidAndCreateAuction(
        leagueIdNum,
        playerIdNum,
        user.id,
        bidAmount
      );
      console.log(
        "[API BIDS POST] Initial bid placed and auction created successfully. Result:",
        result
      );
    }

    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    // 2.4. Gestione centralizzata degli errori (MODIFICATA LA CONDIZIONE PER SLOT PIENI)
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API BIDS POST] Raw Error Object:`, error);
    console.error(`[API BIDS POST] Error Message: ${errorMessage}`);

    if (
      error instanceof SyntaxError &&
      error.message.toLowerCase().includes("json")
    ) {
      return NextResponse.json(
        { error: "Invalid JSON format in request body." },
        { status: 400 }
      );
    }

    let statusCode = 500;
    let clientErrorMessage =
      "An unexpected error occurred while processing your bid.";

    if (error instanceof Error) {
      clientErrorMessage = error.message;

      if (error.message.includes("not found")) {
        statusCode = 404;
      } else if (
        error.message.includes("Bidding is not currently active") ||
        (error.message.includes("Player's role") &&
          error.message.includes("is not currently active for bidding")) ||
        error.message.includes("has already been assigned") ||
        error.message.includes("must be > current bid") ||
        error.message.includes("is already the highest bidder") ||
        error.message.includes("Auction is not active or closing") ||
        error.message.includes("Insufficient budget") ||
        // MODIFICA QUI: Rendi la corrispondenza più generica per l'errore di slot pieni
        error.message.startsWith("Slot full, you cannot bid") ||
        error.message.includes("is less than the minimum bid") ||
        error.message.includes("is not a manager")
      ) {
        statusCode = 400;
      } else if (error.message.includes("active auction already exists")) {
        statusCode = 409;
      } else {
        console.error(
          `[API BIDS POST] Unhandled service error being masked for client: ${error.message}`
        );
        clientErrorMessage =
          "An unexpected error occurred while processing your bid.";
      }
    }

    return NextResponse.json(
      { error: clientErrorMessage },
      { status: statusCode }
    );
  }
}

// 3. Funzione GET per Recuperare lo Stato dell'Asta (INVARIATA)
export async function GET(_request: Request, context: RouteContext) {
  // ... implementazione invariata ...
  console.log(
    "!!!!!!!!!! GET HANDLER REACHED for /api/leagues/[league-id]/players/[player-id]/bids !!!!!!!!!!"
  );
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const playerIdStr = routeParams["player-id"];

    const leagueIdNum = parseInt(leagueIdStr, 10);
    const playerIdNum = parseInt(playerIdStr, 10);

    if (isNaN(leagueIdNum) || isNaN(playerIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID or player ID format." },
        { status: 400 }
      );
    }

    console.log(
      `[API BIDS GET] Requesting auction status for player ${playerIdNum} in league ${leagueIdNum} by user ${user.id}`
    );
    const auctionDetails = await getAuctionStatusForPlayer(
      leagueIdNum,
      playerIdNum
    );

    if (!auctionDetails) {
      return NextResponse.json(
        { message: "No auction found for this player in this league." },
        { status: 404 }
      );
    }

    return NextResponse.json(auctionDetails, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API BIDS GET] Error: ${errorMessage}`);
    return NextResponse.json(
      { error: "Failed to retrieve auction status." },
      { status: 500 }
    );
  }
}

// 4. Configurazione della Route (INVARIATA)
export const dynamic = "force-dynamic";
