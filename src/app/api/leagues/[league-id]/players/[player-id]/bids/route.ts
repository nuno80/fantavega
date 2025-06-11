// src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  type AuctionCreationResult,
  // Importa i tipi di risultato
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

export async function POST(request: Request, context: RouteContext) {
  console.log(
    "!!!!!!!!!! POST HANDLER REACHED for /api/leagues/[league-id]/players/[player-id]/bids !!!!!!!!!!"
  );
  try {
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

    const body = (await request.json()) as PlaceBidRequestBody;

    // Validazione più robusta per amount
    if (
      body.amount === undefined ||
      typeof body.amount !== "number" ||
      body.amount <= 0
    ) {
      // Se è 'quick', l'amount potrebbe non essere rilevante o potrebbe essere 0/1 per indicare +1
      // Ma la nostra logica di servizio per 'quick' calcola l'importo, quindi amount qui è più per 'manual'
      if (body.bid_type !== "quick") {
        // Solo se non è quick bid, amount deve essere > 0
        return NextResponse.json(
          {
            error:
              "Invalid bid amount provided. Amount must be a positive number for manual bids.",
          },
          { status: 400 }
        );
      } else if (
        body.bid_type === "quick" &&
        body.amount <= 0 &&
        body.amount !== undefined
      ) {
        // Se è quick e amount è specificato ma non positivo, è un errore
        return NextResponse.json(
          {
            error:
              "Amount for quick bid, if provided, must be positive or will be ignored.",
          },
          { status: 400 }
        );
      }
    }

    const bidAmount = body.amount; // Per 'quick', il servizio lo ricalcolerà.
    const bidType = body.bid_type || "manual";
    if (bidType !== "manual" && bidType !== "quick") {
      return NextResponse.json(
        { error: "Invalid bid_type. Must be 'manual' or 'quick'." },
        { status: 400 }
      );
    }

    console.log(
      `[API BIDS POST] User ${user.id} attempting bid of ${bidAmount} (type: ${bidType}) for player ${playerIdNum} in league ${leagueIdNum}`
    );

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
        bidAmount, // Passiamo l'amount, il servizio gestirà il calcolo per 'quick'
        bidType
      );
      httpStatus = 200;
      console.log(
        "[API BIDS POST] Bid placed on existing auction successfully. Result:",
        result
      );
    } else {
      console.log(
        "[API BIDS POST] No active auction found. Placing initial bid to create auction."
      );
      if (bidType === "quick") {
        // Per la prima offerta, 'quick' non ha un'offerta precedente a cui aggiungere +1.
        // Il servizio placeInitialBidAndCreateAuction si aspetta un amount.
        // Se amount non è valido (es. <=0), la validazione del body sopra dovrebbe averlo già gestito.
        // Se amount è valido, verrà usato come offerta manuale iniziale.
        console.warn(
          "[API BIDS POST] 'quick' bid type on a new auction; using provided amount as initial manual bid if valid."
        );
        if (bidAmount <= 0) {
          // Se amount non è stato validato sopra per quick
          return NextResponse.json(
            {
              error:
                "Quick bid on a new auction requires a valid positive amount to start or will use league minimum.",
            },
            { status: 400 }
          );
        }
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API BIDS POST] Error: ${errorMessage}`);

    if (
      error instanceof SyntaxError &&
      error.message.toLowerCase().includes("json")
    ) {
      return NextResponse.json(
        { error: "Invalid JSON format in request body." },
        { status: 400 }
      );
    }

    let statusCode = 500; // Default Internal Server Error
    if (error instanceof Error) {
      if (error.message.includes("not found")) statusCode = 404;
      else if (
        error.message.includes("Bidding is not currently active") ||
        error.message.includes("Player's role is not currently active") ||
        error.message.includes("has already been assigned") ||
        error.message.includes(
          "must be greater than the current highest bid"
        ) ||
        error.message.includes("is already the highest bidder") ||
        error.message.includes("Auction is not active or closing") ||
        error.message.includes("Insufficient budget") ||
        error.message.includes("no available slots") ||
        error.message.includes("is less than the minimum bid")
      ) {
        statusCode = 400; // Bad Request per errori di logica di business / validazione
      } else if (error.message.includes("active auction already exists")) {
        // Questo errore da placeInitialBid... non dovrebbe più verificarsi qui a causa del check precedente
        statusCode = 409; // Conflict
      }
    }
    // Se lo statusCode è ancora 500, è un errore server non previsto.
    // Altrimenti, usiamo lo statusCode determinato.
    const clientErrorMessage =
      statusCode === 500 ? "Failed to process bid." : errorMessage;
    return NextResponse.json(
      { error: clientErrorMessage },
      { status: statusCode }
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
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
      // Invece di 404, potremmo voler restituire uno stato che indica "nessuna asta per questo giocatore"
      // ma per ora 404 va bene se l'aspettativa è che un'asta esista.
      // O un oggetto con status: 'not_started' o simile.
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

export const dynamic = "force-dynamic";
