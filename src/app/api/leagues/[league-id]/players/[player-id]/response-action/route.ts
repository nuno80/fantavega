// src/app/api/leagues/[league-id]/players/[player-id]/response-action/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { placeBidOnExistingAuction } from "@/lib/db/services/bid.service";
import {
  getUserCooldownInfo,
  markTimerCompleted,
  processUserResponse,
} from "@/lib/db/services/response-timer.service";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  console.log("[API RESPONSE-ACTION] Request received.");

  try {
    const user = await currentUser();
    if (!user || !user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { "league-id": leagueIdParam, "player-id": playerIdParam } =
      await params;
    const leagueId = parseInt(leagueIdParam, 10);
    const playerId = parseInt(playerIdParam, 10);

    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json(
        { error: "Invalid league or player ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body;
    console.log(`[API RESPONSE-ACTION] Received action: '${action}'`);

    if (action !== "bid" && action !== "fold") {
      console.error(`[API RESPONSE-ACTION] Invalid action received: '${action}'`);
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    console.log(`[API RESPONSE-ACTION] Action validated successfully`);

    // 1. Verifica che l'utente partecipi alla lega
    console.log(`[API RESPONSE-ACTION] Checking league participation for user ${user.id} in league ${leagueId}`);
    const participantResult = await db.execute({
      sql: `SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?`,
      args: [leagueId, user.id],
    });
    const participant = participantResult.rows[0];

    if (!participant) {
      console.error(`[API RESPONSE-ACTION] User ${user.id} not found in league ${leagueId}`);
      return NextResponse.json(
        { error: "Non sei autorizzato ad accedere a questa lega" },
        { status: 403 }
      );
    }
    console.log(`[API RESPONSE-ACTION] League participation confirmed`);

    // 2. Verifica cooldown
    console.log(`[API RESPONSE-ACTION] Checking cooldown for user ${user.id}, player ${playerId}`);
    const cooldownInfo = await getUserCooldownInfo(user.id, playerId, leagueId);
    console.log(`[API RESPONSE-ACTION] Cooldown check result:`, cooldownInfo);

    if (!cooldownInfo.canBid) {
      console.error(`[API RESPONSE-ACTION] User ${user.id} is in cooldown for player ${playerId}`);
      return NextResponse.json(
        {
          error: "Cooldown attivo",
          message: cooldownInfo.message,
          timeRemaining: cooldownInfo.timeRemaining,
        },
        { status: 429 }
      );
    }
    console.log(`[API RESPONSE-ACTION] Cooldown check passed`);

    // 3. Recupera l'asta attiva
    console.log(`[API RESPONSE-ACTION] Fetching active auction for player ${playerId} in league ${leagueId}`);
    const auctionResult = await db.execute({
      sql: `
        SELECT
          a.id,
          a.player_id,
          a.auction_league_id,
          a.current_highest_bid_amount,
          a.current_highest_bidder_id,
          a.status,
          p.name as player_name
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ? AND a.player_id = ? AND a.status = 'active'
      `,
      args: [leagueId, playerId],
    });
    const auction = auctionResult.rows[0] as unknown as
      | {
        id: number;
        player_id: number;
        auction_league_id: number;
        current_highest_bid_amount: number;
        current_highest_bidder_id: string;
        status: string;
        player_name: string;
      }
      | undefined;

    console.log(`[API RESPONSE-ACTION] Auction query result:`, auction ? `Found auction ${auction.id}` : 'No auction found');

    if (!auction) {
      console.error(`[API RESPONSE-ACTION] No active auction found for player ${playerId} in league ${leagueId}`);
      return NextResponse.json(
        { error: "Asta non attiva o non trovata" },
        { status: 404 }
      );
    }
    console.log(`[API RESPONSE-ACTION] Active auction found: ${auction.id}`);

    // 4. Processa l'azione usando il servizio (solo per fold o validazione bid)
    console.log(`[API RESPONSE-ACTION] Processing action '${action}' for user ${user.id}, player ${playerId}, league ${leagueId}`);

    const result = await processUserResponse(
      user.id,
      leagueId,
      playerId,
      action
    );

    console.log(`[API RESPONSE-ACTION] processUserResponse result:`, result);

    if (!result.success) {
      console.error(`[API RESPONSE-ACTION] Action failed:`, result.message);
      return NextResponse.json(
        { error: result.message || "Failed to process action" },
        { status: 400 }
      );
    }

    // 5. Se l'azione è "bid", esegui il rilancio qui
    if (action === "bid") {
      try {
        // Calcola importo minimo rilancio (bid corrente + 1)
        const bidAmount = auction.current_highest_bid_amount + 1;

        // Esegui il bid usando il servizio esistente
        const bidResult = await placeBidOnExistingAuction({
          leagueId,
          playerId,
          userId: user.id,
          bidAmount,
          bidType: "manual",
        });

        // Segna il timer come completato
        await markTimerCompleted(auction.id, user.id);

        return NextResponse.json(
          {
            success: true,
            message: "Offerta piazzata con successo",
            newState: bidResult,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("[API RESPONSE-ACTION] Error placing bid:", error);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Errore durante il rilancio",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: result.message,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API RESPONSE-ACTION] Error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: "Failed to process response action." },
      { status: 500 }
    );
  }
}
