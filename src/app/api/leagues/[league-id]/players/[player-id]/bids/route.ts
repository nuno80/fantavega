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
import { errorResponse } from "@/lib/errors";
import { logger, withCorrelationId } from "@/lib/logger";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rate-limiter";

// Request deduplication to prevent race conditions
const pendingBidRequests = new Map<string, Promise<NextResponse>>();
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

const log = logger.child({ scope: "bids-route" });

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
  const correlationId =
    request.headers.get("x-correlation-id") ?? crypto.randomUUID();
  return withCorrelationId(correlationId, async () => {
    log.info("POST bid handler reached", { correlationId });

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

    log.debug("checking for concurrent bid request", { dedupeKey });

    // Check if there's already a pending request for this user/league/player combination
    if (pendingBidRequests.has(dedupeKey)) {
      log.warn("duplicate concurrent bid request blocked", { dedupeKey });
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
    }, REQUEST_TIMEOUT_MS);

    try {
      const result = await requestPromise;
      pendingBidRequests.delete(dedupeKey);
      return result;
    } catch (error) {
      pendingBidRequests.delete(dedupeKey);
      log.error("bid request failed", { dedupeKey, error });
      return errorResponse(error, "bids-route", { dedupeKey });
    }
  });
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
    log.debug("bid request body parsed", {
      bidType: body.bid_type,
      hasMaxAmount: body.max_amount !== undefined,
    });

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

    const rateCheck = await checkRateLimit(
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

    log.info("placing bid", {
      userId: user.id,
      leagueId: leagueIdNum,
      playerId: playerIdNum,
      bidType,
    });

    // 2.3. Logica di offerta: determina se creare una nuova asta o fare un'offerta su una esistente (INVARIATO)
    const existingAuctionStatus = await getAuctionStatusForPlayer(
      leagueIdNum,
      playerIdNum
    );

    let result: AuctionCreationResult | { message: string };
    let httpStatus = 201;

    if (
      existingAuctionStatus &&
      (existingAuctionStatus.status === "active" ||
        existingAuctionStatus.status === "closing")
    ) {
      result = await placeBidOnExistingAuction({
        leagueId: leagueIdNum,
        playerId: playerIdNum,
        userId: user.id,
        bidAmount,
        bidType,
        autoBidMaxAmount: body.max_amount, // Pass auto-bid amount
      });
      httpStatus = 200;
    } else {
      // CRITICAL: Log why we're creating a new auction instead of updating existing one
      const reason = !existingAuctionStatus
        ? "NO_AUCTION_EXISTS"
        : `AUCTION_STATUS_${existingAuctionStatus.status.toUpperCase()}`;

      log.info("no biddable auction, creating new one", {
        leagueId: leagueIdNum,
        playerId: playerIdNum,
        reason,
      });

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
        log.warn("quick bid on a new auction, using amount as initial manual bid");
      }
      result = await placeInitialBidAndCreateAuction(
        leagueIdNum,
        playerIdNum,
        user.id,
        bidAmount,
        body.max_amount // Pass auto-bid amount
      );
    }

    return NextResponse.json(result, { status: httpStatus });
  } catch (error) {
    // 2.4. Gestione centralizzata degli errori: mappa a codice pubblico stabile.
    return errorResponse(error, "bids-route", {
      userId: user.id,
      leagueId: leagueIdNum,
      playerId: playerIdNum,
    });
  }
}

// 3. Funzione GET per Recuperare lo Stato dell'Asta (INVARIATA)
export async function GET(_request: Request, context: RouteContext) {
  // ... implementazione invariata ...
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
    return errorResponse(error, "bids-route");
  }
}

// 4. Configurazione della Route (INVARIATA)
export const dynamic = "force-dynamic";
