// src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts v.1.4
// API Route Handler per la gestione delle offerte (POST) e il recupero dello stato di un'asta (GET) per un giocatore specifico in una lega.
// Enhanced with request deduplication to prevent race conditions
// 1. Importazioni e Definizioni di Interfaccia (ENHANCED)
import { NextResponse } from "next/server";

import { type User, currentUser } from "@clerk/nextjs/server";

import {
  type AuctionCreationResult,
  getAuctionStatusForPlayer,
  placeBidOnExistingAuction,
  placeInitialBidAndCreateAuction,
} from "@/lib/db/services/bid.service";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rate-limiter";

// Request deduplication to prevent race conditions
const pendingBidRequests = new Map<string, Promise<NextResponse>>();
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

interface RouteContext {
  params: Promise<{
    "league-id": string;
    "player-id": string;
  }>;
}

interface PlaceBidRequestBody {
  amount: number;
  bid_type?: "manual" | "quick" | "auto";
  max_amount?: number; // For auto-bids
}

// 2. Funzione POST per Piazzare Offerte (ENHANCED WITH DEDUPLICATION)
export async function POST(request: Request, context: RouteContext) {
  console.log(
    "!!!!!!!!!! POST HANDLER REACHED for /api/leagues/[league-id]/players/[player-id]/bids !!!!!!!!!!"
  );

  // Parse route parameters early for deduplication
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

  // Get user for deduplication key
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be logged in to place a bid." },
      { status: 401 }
    );
  }

  // CRITICAL: Request deduplication to prevent race conditions
  const dedupeKey = `${user.id}-${leagueIdNum}-${playerIdNum}`;

  console.log(`[BID API] 🔒 Checking for concurrent request: ${dedupeKey}`);

  // Check if there's already a pending request for this user/league/player combination
  if (pendingBidRequests.has(dedupeKey)) {
    console.warn(
      `[BID API] 🚨 DUPLICATE REQUEST BLOCKED for user ${user.id}, league ${leagueIdNum}, player ${playerIdNum}`
    );
    return NextResponse.json(
      {
        error:
          "Un'altra offerta per questo giocatore è già in corso. Attendi il completamento.",
      },
      { status: 409 }
    );
  }

  // Create promise for this request and store it
  const requestPromise = processBidRequest(
    request,
    context,
    user,
    leagueIdNum,
    playerIdNum
  );
  pendingBidRequests.set(dedupeKey, requestPromise);

  // Set timeout to cleanup pending request
  setTimeout(() => {
    pendingBidRequests.delete(dedupeKey);
    console.log(`[BID API] 🧹 Cleaned up request: ${dedupeKey}`);
  }, REQUEST_TIMEOUT_MS);

  try {
    const result = await requestPromise;
    pendingBidRequests.delete(dedupeKey);
    console.log(`[BID API] ✅ Request completed: ${dedupeKey}`);
    return result;
  } catch (error) {
    pendingBidRequests.delete(dedupeKey);
    console.error(`[BID API] ❌ Request failed: ${dedupeKey}`, error);
    throw error;
  }
}

// Extracted bid processing logic
async function processBidRequest(
  request: Request,
  context: RouteContext,
  user: User,
  leagueIdNum: number,
  playerIdNum: number
): Promise<NextResponse> {
  try {
    // 2.1. Parsing del body della richiesta (INVARIATO)
    const body: PlaceBidRequestBody = await request.json();
    console.log(`[API BIDS POST] Request body:`, body);
    console.log(`[DEBUG AUTO-BID] max_amount received:`, body.max_amount);
    console.log(`[DEBUG AUTO-BID] max_amount type:`, typeof body.max_amount);
    console.log(
      `[DEBUG AUTO-BID] max_amount is undefined:`,
      body.max_amount === undefined
    );
    console.log(
      `[DEBUG AUTO-BID] max_amount is null:`,
      body.max_amount === null
    );

    // 2.1.1. Rate Limiting per offerte
    const bidType = body.bid_type || "manual";
    let rateLimitConfig;

    switch (bidType) {
      case "auto":
        rateLimitConfig = RATE_LIMITS.BID_AUTO;
        break;
      case "quick":
        rateLimitConfig = RATE_LIMITS.BID_QUICK;
        break;
      default:
        rateLimitConfig = RATE_LIMITS.BID_MANUAL;
    }

    const rateCheck = checkRateLimit(
      user.id,
      `bid_${bidType}`,
      rateLimitConfig.limit,
      rateLimitConfig.windowMs
    );

    if (!rateCheck.allowed) {
      const waitTime = Math.ceil((rateCheck.resetTime! - Date.now()) / 1000);
      return NextResponse.json(
        {
          error: `Troppe offerte ${bidType}! Riprova tra ${waitTime} secondi.`,
          retryAfter: waitTime,
          type: "rate_limit_exceeded",
        },
        {
          status: 429,
          headers: {
            "Retry-After": waitTime.toString(),
            "X-RateLimit-Limit": rateLimitConfig.limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateCheck.resetTime!.toString(),
          },
        }
      );
    }

    // Body già parsato sopra per rate limiting
    const bidAmount = body.amount;
    // bidType già definito sopra per rate limiting
    console.log(
      "[API BIDS POST] Parsed - bidAmount:",
      bidAmount,
      "bidType:",
      bidType
    );

    if (bidType !== "manual" && bidType !== "quick" && bidType !== "auto") {
      return NextResponse.json(
        { error: "Invalid bid_type. Must be 'manual', 'quick', or 'auto'." },
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
    console.log(
      `[API BIDS POST] 🔍 CRITICAL DEBUG - Checking for existing auction for player ${playerIdNum} in league ${leagueIdNum}`
    );

    // CRITICAL: Special tracking for player 5672 auction 1069 issue
    if (playerIdNum === 5672) {
      console.log(
        `[API BIDS POST] 🚨 PLAYER 5672 DETECTED - This is the problematic case!`
      );
      console.log(`[API BIDS POST] Request details:`, {
        userId: user.id,
        bidAmount,
        bidType,
        maxAmount: body.max_amount,
        requestTimestamp: new Date().toISOString(),
      });
    }

    const existingAuctionStatus = await getAuctionStatusForPlayer(
      leagueIdNum,
      playerIdNum
    );

    console.log(`[API BIDS POST] 📊 AUCTION DETECTION RESULT:`, {
      found: !!existingAuctionStatus,
      status: existingAuctionStatus?.status,
      auctionId: existingAuctionStatus?.id,
      playerId: existingAuctionStatus?.player_id,
      scheduledEndTime: existingAuctionStatus?.scheduled_end_time,
      currentBid: existingAuctionStatus?.current_highest_bid_amount,
      currentTime: Math.floor(Date.now() / 1000),
      willCreateNewAuction:
        !existingAuctionStatus ||
        !["active", "closing"].includes(existingAuctionStatus.status),
    });

    let result: AuctionCreationResult | { message: string };
    let httpStatus = 201;

    if (
      existingAuctionStatus &&
      (existingAuctionStatus.status === "active" ||
        existingAuctionStatus.status === "closing")
    ) {
      console.log(
        `[API BIDS POST] ✅ Active auction found (ID: ${existingAuctionStatus.id}, status: ${existingAuctionStatus.status}). Placing bid on existing auction.`
      );
      console.log(
        `[DEBUG AUTO-BID] Passing autoBidMaxAmount to placeBidOnExistingAuction:`,
        body.max_amount
      );
      result = await placeBidOnExistingAuction({
        leagueId: leagueIdNum,
        playerId: playerIdNum,
        userId: user.id,
        bidAmount,
        bidType,
        autoBidMaxAmount: body.max_amount, // Pass auto-bid amount
      });
      httpStatus = 200;
      console.log(
        "[API BIDS POST] ✅ Bid placed on existing auction successfully. Result:",
        result
      );
    } else {
      // CRITICAL: Log why we're creating a new auction instead of updating existing one
      const reason = !existingAuctionStatus
        ? "NO_AUCTION_EXISTS"
        : `AUCTION_STATUS_${existingAuctionStatus.status.toUpperCase()}`;

      console.log(
        `[API BIDS POST] ⚠️ No active auction found or auction not in biddable state. Reason: ${reason}. Placing initial bid to create auction.`
      );

      // Additional logging for debugging
      if (existingAuctionStatus) {
        console.log(`[API BIDS POST] 📊 Existing auction details:`, {
          id: existingAuctionStatus.id,
          status: existingAuctionStatus.status,
          currentBid: existingAuctionStatus.current_highest_bid_amount,
          scheduledEndTime: existingAuctionStatus.scheduled_end_time,
          timeRemaining: existingAuctionStatus.time_remaining_seconds,
          isExpired: existingAuctionStatus.scheduled_end_time
            ? existingAuctionStatus.scheduled_end_time <
              Math.floor(Date.now() / 1000)
            : "unknown",
        });

        // This should trigger auction-update, but we're creating new auction - investigate!
        if (
          existingAuctionStatus.status === "active" ||
          existingAuctionStatus.status === "closing"
        ) {
          console.error(
            `[API BIDS POST] 🚨 CRITICAL BUG: Found ${existingAuctionStatus.status} auction but condition failed! This should not happen!`
          );
        }
      }
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
        bidAmount,
        body.max_amount // Pass auto-bid amount
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
        // Cattura "Player not found", "League not found", "Auction not found"
        statusCode = 404;
      } else if (
        error.message.includes("non sono attualmente attive") || // Mercato per ruolo non attivo
        error.message.includes("Bidding is not currently active") ||
        (error.message.includes("Player's role") &&
          error.message.includes("is not currently active for bidding")) ||
        error.message.includes("has already been assigned") ||
        error.message.includes("must be > current bid") ||
        error.message.includes(
          "L'offerta deve essere superiore all'offerta attuale"
        ) || // Auto-bid sync issue
        error.message.includes("is already the highest bidder") ||
        error.message.includes("Sei già il miglior offerente") ||
        error.message.includes("Auction is not active or closing") ||
        error.message.includes("Insufficient budget") || // Già presente
        error.message.startsWith("Insufficient available budget") || // <<< NUOVA CONDIZIONE AGGIUNTA
        error.message.startsWith("Slot full, you cannot bid") ||
        error.message.includes("is less than the minimum bid") ||
        error.message.includes("is not a participant") || // Cambiato da "is not a manager" se il controllo è sulla partecipazione
        error.message.includes("is not a manager") || // Mantenuto se c'è un controllo specifico sul ruolo manager per fare offerte
        error.message.includes("Hai abbandonato l'asta per questo giocatore") || // Cooldown message
        error.message.includes("Riprova tra") // Cooldown time remaining
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

    console.error(
      `[API BIDS POST] Returning error to client: Status ${statusCode}, Message: "${clientErrorMessage}"`
    );
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
