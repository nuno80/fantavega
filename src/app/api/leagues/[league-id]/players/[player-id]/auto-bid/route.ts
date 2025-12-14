// src/app/api/leagues/[league-id]/players/[player-id]/auto-bid/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  console.log("[API AUTO-BID] Request received.");

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
    const { maxAmount } = body;

    if (typeof maxAmount !== "number" || maxAmount < 0) {
      return NextResponse.json(
        { error: "Invalid max amount" },
        { status: 400 }
      );
    }

    // 1. Verifica che l'utente partecipi alla lega e ottieni il budget
    const participantResult = await db.execute({
      sql: `SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`,
      args: [leagueId, user.id],
    });
    const participant = participantResult.rows[0] as unknown as
      | {
        user_id: string;
        current_budget: number;
        locked_credits: number;
      }
      | undefined;

    if (!participant) {
      return NextResponse.json(
        { error: "Non sei autorizzato ad accedere a questa lega" },
        { status: 403 }
      );
    }

    // 2. Verifica che l'asta sia attiva
    const auctionResult = await db.execute({
      sql: `SELECT id, status, current_highest_bid_amount FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'`,
      args: [leagueId, playerId],
    });
    const auction = auctionResult.rows[0] as unknown as
      | {
        id: number;
        status: string;
        current_highest_bid_amount: number;
      }
      | undefined;

    if (!auction) {
      return NextResponse.json(
        { error: "Asta non attiva per questo giocatore" },
        { status: 400 }
      );
    }

    // 3. Se maxAmount > 0, verifica budget disponibile
    if (maxAmount > 0) {
      // Calcola budget disponibile (escludendo eventuali crediti bloccati per auto-bid su ALTRI giocatori)
      // Nota: se stiamo aggiornando un auto-bid esistente su QUESTO giocatore, i suoi crediti bloccati non devono contare contro il nuovo limite
      // Ma per semplicità, controlliamo solo budget totale - crediti bloccati totali + (eventuale auto-bid precedente su questo giocatore)
      // Per ora usiamo una logica semplificata: maxAmount deve essere <= current_budget
      // In una implementazione più robusta, dovremmo considerare i locked_credits correttamente.

      // Recupera eventuale auto-bid esistente per questo giocatore per sottrarlo dai locked credits nel calcolo disponibilità
      const existingAutoBidResult = await db.execute({
        sql: `SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE`,
        args: [auction.id, user.id],
      });
      const existingAutoBid = existingAutoBidResult.rows[0] as unknown as
        | { max_amount: number }
        | undefined;

      const currentLockedForThis = existingAutoBid
        ? existingAutoBid.max_amount
        : 0;
      const availableBudget =
        participant.current_budget -
        (participant.locked_credits - currentLockedForThis);

      if (maxAmount > availableBudget) {
        return NextResponse.json(
          {
            error: `Budget insufficiente. Disponibile: ${availableBudget}, Richiesto: ${maxAmount}`,
          },
          { status: 400 }
        );
      }

      if (maxAmount <= auction.current_highest_bid_amount) {
        return NextResponse.json(
          {
            error: `L'auto-bid deve essere superiore all'offerta corrente (${auction.current_highest_bid_amount})`,
          },
          { status: 400 }
        );
      }
    }

    // 4. Upsert auto-bid
    // Usiamo una transazione per gestire l'aggiornamento
    const tx = await db.transaction("write");
    try {
      if (maxAmount > 0) {
        // Inserisci o aggiorna
        await tx.execute({
          sql: `
            INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
            VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(auction_id, user_id) DO UPDATE SET
              max_amount = excluded.max_amount,
              is_active = TRUE,
              updated_at = CURRENT_TIMESTAMP
          `,
          args: [auction.id, user.id, maxAmount],
        });
      } else {
        // Disattiva auto-bid se maxAmount è 0
        await tx.execute({
          sql: `
            UPDATE auto_bids
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE auction_id = ? AND user_id = ?
          `,
          args: [auction.id, user.id],
        });
      }

      // Ricalcola i locked_credits per l'utente
      // Questo è un passaggio costoso ma sicuro. In alternativa potremmo aggiornare incrementalmente.
      // Per sicurezza ricalcoliamo: somma dei max_amount di tutti gli auto-bid attivi
      // Nota: dobbiamo considerare TUTTE le aste attive della lega
      const lockedCreditsResult = await tx.execute({
        sql: `
          SELECT SUM(ab.max_amount) as total_locked
          FROM auto_bids ab
          JOIN auctions a ON ab.auction_id = a.id
          WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE
        `,
        args: [leagueId, user.id],
      });
      const totalLocked =
        (lockedCreditsResult.rows[0].total_locked as number) || 0;

      await tx.execute({
        sql: `UPDATE league_participants SET locked_credits = ? WHERE league_id = ? AND user_id = ?`,
        args: [totalLocked, leagueId, user.id],
      });

      await tx.commit();
    } catch (err) {
      tx.rollback();
      throw err;
    }

    return NextResponse.json(
      { success: true, maxAmount, isActive: maxAmount > 0 },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API AUTO-BID] Error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: "Failed to set auto-bid." },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
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

    // Trova l'asta attiva per questo giocatore
    const auctionResult = await db.execute({
      sql: `SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'`,
      args: [leagueId, playerId],
    });
    const auction = auctionResult.rows[0] as unknown as
      | { id: number }
      | undefined;

    if (!auction) {
      return NextResponse.json({ auto_bid: null });
    }

    const autoBidResult = await db.execute({
      sql: `SELECT max_amount, is_active FROM auto_bids WHERE auction_id = ? AND user_id = ?`,
      args: [auction.id, user.id],
    });
    const autoBid = autoBidResult.rows[0] as unknown as
      | { max_amount: number; is_active: number }
      | undefined;

    if (!autoBid) {
      return NextResponse.json({ auto_bid: null });
    }

    return NextResponse.json({
      auto_bid: {
        max_amount: autoBid.max_amount,
        is_active: Boolean(autoBid.is_active),
      },
    });
  } catch (error) {
    console.error("[API AUTO-BID GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch auto-bid" },
      { status: 500 }
    );
  }
}
