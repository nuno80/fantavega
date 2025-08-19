// src/app/api/leagues/[league-id]/players/[player-id]/auto-bid/route.ts
// API endpoint for managing auto-bids

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

interface RouteContext {
  params: Promise<{
    "league-id": string;
    "player-id": string;
  }>;
}

interface AutoBidRequestBody {
  max_amount: number; // 0 to disable auto-bid
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);
    const playerId = parseInt(resolvedParams["player-id"]);
    
    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json({ error: "ID non validi" }, { status: 400 });
    }

    const body = await request.json() as AutoBidRequestBody;
    const { max_amount } = body;

    if (typeof max_amount !== "number" || max_amount < 0) {
      return NextResponse.json({ error: "Importo massimo non valido" }, { status: 400 });
    }

    // Check if user is participant in the league
    const participant = db
      .prepare("SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?")
      .get(leagueId, user.id) as {
        user_id: string;
        current_budget: number;
        locked_credits: number;
      } | undefined;

    if (!participant) {
      return NextResponse.json({ error: "Non sei un partecipante di questa lega" }, { status: 403 });
    }

    // Check if auction exists and is active
    const auction = db
      .prepare("SELECT id, current_highest_bid_amount, status FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
      .get(leagueId, playerId) as {
        id: number;
        current_highest_bid_amount: number;
        status: string;
      } | undefined;

    if (!auction) {
      return NextResponse.json({ error: "Asta non trovata o non attiva" }, { status: 404 });
    }

    // --- LOGICA TRANSAZIONALE CORRETTA ---
    const transactionResult = db.transaction(() => {
      const now = Math.floor(Date.now() / 1000);

      // 1. Ottieni il vecchio importo dell'auto-bid per calcolare la differenza
      const oldAutoBid = db
        .prepare("SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE")
        .get(auction.id, user.id) as { max_amount: number } | undefined;
      
      const oldMaxAmount = oldAutoBid?.max_amount || 0;

      // Il nuovo importo è quello inviato dall'utente (0 per disattivare)
      const newMaxAmount = max_amount;

      // 2. Calcola la variazione nei crediti bloccati
      const creditChange = newMaxAmount - oldMaxAmount;

      // 3. Valida se l'utente ha abbastanza budget per la VARIAZIONE
      const availableBudget = participant.current_budget - participant.locked_credits;
      if (creditChange > availableBudget) {
        throw new Error(`Budget insufficiente per bloccare i crediti. Disponibile: ${availableBudget}, Aumento richiesto: ${creditChange}`);
      }

      // 4. Aggiorna i locked_credits in league_participants
      if (creditChange !== 0) {
          db.prepare("UPDATE league_participants SET locked_credits = locked_credits + ? WHERE league_id = ? AND user_id = ?")
            .run(creditChange, leagueId, user.id);
      }

      // 5. Inserisci/Aggiorna o Disattiva l'auto-bid
      if (newMaxAmount > 0) {
          // Valida che il nuovo importo sia superiore all'offerta attuale
          if (newMaxAmount <= auction.current_highest_bid_amount) {
            throw new Error(`Il prezzo massimo deve essere superiore all'offerta attuale (${auction.current_highest_bid_amount})`);
          }
          db.prepare(`
              INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
              VALUES (?, ?, ?, TRUE, ?, ?)
              ON CONFLICT(auction_id, user_id)
              DO UPDATE SET
                max_amount = excluded.max_amount,
                is_active = TRUE,
                updated_at = excluded.updated_at
          `).run(auction.id, user.id, newMaxAmount, now, now);
      } else {
          // Se newMaxAmount è 0, disattiva l'auto-bid
          db.prepare("UPDATE auto_bids SET is_active = FALSE, updated_at = strftime('%s', 'now') WHERE auction_id = ? AND user_id = ?")
            .run(auction.id, user.id);
      }

      return {
          message: newMaxAmount > 0 ? "Auto-offerta impostata con successo" : "Auto-offerta disattivata",
          max_amount: newMaxAmount,
          auction_id: auction.id,
      };
    })();

    return NextResponse.json(transactionResult);

  } catch (error) {
    console.error("Error managing auto-bid:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Errore nella gestione dell'auto-offerta" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve current auto-bid for user
export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);
    const playerId = parseInt(resolvedParams["player-id"]);
    
    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json({ error: "ID non validi" }, { status: 400 });
    }

    // Get auction
    const auction = db
      .prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
      .get(leagueId, playerId) as {
        id: number;
      } | undefined;

    if (!auction) {
      return NextResponse.json({ auto_bid: null });
    }

    // Get auto-bid
    const autoBid = db
      .prepare("SELECT max_amount, is_active, created_at, updated_at FROM auto_bids WHERE auction_id = ? AND user_id = ?")
      .get(auction.id, user.id);

    return NextResponse.json({
      auto_bid: autoBid || null
    });

  } catch (error) {
    console.error("Error getting auto-bid:", error);
    return NextResponse.json(
      { error: "Errore nel recuperare l'auto-offerta" },
      { status: 500 }
    );
  }
}
