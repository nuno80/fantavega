// src/lib/db/services/auction-states.service.ts
// Servizio per gestire gli stati dei giocatori nelle aste
import { db } from "@/lib/db";
import { activateTimersForUser, createResponseTimer } from "@/lib/db/services/response-timer.service";
import { recordUserLogin } from "@/lib/db/services/session.service";
import { notifySocketServer } from "@/lib/socket-emitter";

// Stati possibili per un utente in un'asta
export type UserAuctionState =
  | "miglior_offerta" // Verde - sei il miglior offerente
  | "rilancio_possibile" // Rosso - puoi rilanciare o abbandonare
  | "asta_abbandonata"; // Grigio - hai abbandonato, cooldown attivo

interface UserAuctionStates {
  [userId: string]: UserAuctionState;
}

export interface AuctionStateRow {
  auction_id: number;
  player_id: number;
  player_name: string;
  player_team: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string;
  current_highest_bid_amount: number;
  response_deadline: number | null;
  activated_at: number | null;
  cooldown_ends_at: number | null;
}

export interface UserAuctionStateDetail {
  auction_id: number;
  player_id: number;
  player_name: string;
  player_team: string;
  player_photo_url: string | null;
  current_bid: number;
  user_state: UserAuctionState;
  response_deadline: number | null;
  time_remaining: number | null;
  is_highest_bidder: boolean;
}

/**
 * Retrieves the auction states for a specific user in a league.
 * Also handles side effects like recording login and activating timers.
 */
export const getUserAuctionStates = async (
  userId: string,
  leagueId: number
): Promise<UserAuctionStateDetail[]> => {
  console.log(
    `[SERVICE] getUserAuctionStates called for user: ${userId}, league: ${leagueId}`
  );

  // **FASE 0: Registra login utente**
  try {
    await recordUserLogin(userId);
  } catch (error) {
    console.error("[SERVICE] Error recording login:", error);
    // Non bloccare la richiesta per errori di sessione
  }

  // **FASE 1: Attiva i timer pendenti per l'utente**
  await activateTimersForUser(userId);

  // **FASE 2: Recupera lo stato di tutte le aste attive in cui l'utente è coinvolto**
  const now = Math.floor(Date.now() / 1000);

  const involvedAuctionsResult = await db.execute({
    sql: `
        SELECT
          a.id as auction_id,
          a.player_id,
          p.name as player_name,
          p.team as player_team,
          p.photo_url as player_photo_url,
          a.current_highest_bidder_id,
          a.current_highest_bid_amount,
          urt.response_deadline,
          urt.activated_at,
          upp.expires_at as cooldown_ends_at
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        -- Join per trovare le aste in cui l'utente ha fatto un'offerta
        JOIN bids b ON a.id = b.auction_id AND b.user_id = ?
        -- Join per ottenere il timer di risposta, se esiste
        LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
        -- Join per verificare il cooldown
        LEFT JOIN user_player_preferences upp ON a.player_id = upp.player_id AND upp.user_id = ? AND upp.league_id = a.auction_league_id AND upp.preference_type = 'cooldown' AND upp.expires_at > ?
        WHERE a.auction_league_id = ? AND a.status = 'active'
        GROUP BY a.id
      `,
    args: [userId, userId, userId, now, leagueId],
  });

  // Conversione sicura da Row[] a AuctionStateRow[]
  const involvedAuctions: AuctionStateRow[] = involvedAuctionsResult.rows.map(
    (row) => ({
      auction_id: row.auction_id as number,
      player_id: row.player_id as number,
      player_name: row.player_name as string,
      player_team: row.player_team as string,
      player_photo_url: row.player_photo_url as string | null,
      current_highest_bidder_id: row.current_highest_bidder_id as string,
      current_highest_bid_amount: row.current_highest_bid_amount as number,
      response_deadline: row.response_deadline as number | null,
      activated_at: row.activated_at as number | null,
      cooldown_ends_at: row.cooldown_ends_at as number | null,
    })
  );

  const statesWithDetails = involvedAuctions.map((auction) => {
    let user_state: UserAuctionState;
    const isHighestBidder = auction.current_highest_bidder_id === userId;
    const isInCooldown =
      auction.cooldown_ends_at && auction.cooldown_ends_at > now;

    if (isInCooldown) {
      user_state = "asta_abbandonata";
    } else if (isHighestBidder) {
      user_state = "miglior_offerta";
    } else {
      // Se non è il migliore offerente e non è in cooldown, deve rispondere
      user_state = "rilancio_possibile";
    }

    return {
      auction_id: auction.auction_id,
      player_id: auction.player_id,
      player_name: auction.player_name,
      player_team: auction.player_team,
      player_photo_url: auction.player_photo_url,
      current_bid: auction.current_highest_bid_amount,
      user_state: user_state,
      response_deadline: auction.response_deadline,
      time_remaining: auction.response_deadline
        ? Math.max(0, auction.response_deadline - now)
        : null,
      is_highest_bidder: isHighestBidder,
    };
  });

  return statesWithDetails;
};

/**
 * Ottiene lo stato di un utente per un'asta specifica
 */
export const getUserAuctionState = async (
  auctionId: number,
  userId: string
): Promise<UserAuctionState> => {
  try {
    const auctionResult = await db.execute({
      sql: `
      SELECT user_auction_states, current_highest_bidder_id
      FROM auctions
      WHERE id = ?
    `,
      args: [auctionId],
    });
    const auction = auctionResult.rows[0]
      ? {
        user_auction_states: auctionResult.rows[0].user_auction_states as string,
        current_highest_bidder_id: auctionResult.rows[0].current_highest_bidder_id as string
      }
      : undefined;

    if (!auction) {
      return "miglior_offerta"; // Default se asta non trovata
    }

    // Se sei il miglior offerente, sei sempre in stato 'miglior_offerta'
    if (auction.current_highest_bidder_id === userId) {
      return "miglior_offerta";
    }

    // Altrimenti controlla gli stati salvati
    const states: UserAuctionStates = auction.user_auction_states
      ? JSON.parse(auction.user_auction_states)
      : {};

    return states[userId] || "miglior_offerta";
  } catch (error) {
    console.error(
      `[AUCTION_STATES] Error getting state for user ${userId}, auction ${auctionId}:`,
      error
    );
    return "miglior_offerta";
  }
};

/**
 * Imposta lo stato di un utente per un'asta specifica
 */
export const setUserAuctionState = async (
  auctionId: number,
  userId: string,
  state: UserAuctionState
): Promise<void> => {
  try {
    // Ottieni gli stati attuali
    const auctionResult = await db.execute({
      sql: `
      SELECT user_auction_states, current_highest_bidder_id, player_id
      FROM auctions a
      WHERE a.id = ?
    `,
      args: [auctionId],
    });
    const auction = auctionResult.rows[0]
      ? {
        user_auction_states: auctionResult.rows[0].user_auction_states as string,
        current_highest_bidder_id: auctionResult.rows[0].current_highest_bidder_id as string,
        player_id: auctionResult.rows[0].player_id as number
      }
      : undefined;

    if (!auction) {
      throw new Error(`Auction ${auctionId} not found`);
    }

    const currentStates: UserAuctionStates = auction.user_auction_states
      ? JSON.parse(auction.user_auction_states)
      : {};

    // Aggiorna lo stato dell'utente
    currentStates[userId] = state;

    // Salva nel database
    await db.execute({
      sql: `
      UPDATE auctions
      SET user_auction_states = ?
      WHERE id = ?
    `,
      args: [JSON.stringify(currentStates), auctionId],
    });

    console.log(
      `[AUCTION_STATES] Set state '${state}' for user ${userId} in auction ${auctionId}`
    );

    // Invia notifica Socket.IO per aggiornamento UI
    await notifySocketServer({
      room: `user-${userId}`,
      event: "auction-state-changed",
      data: {
        auctionId,
        playerId: auction.player_id,
        newState: state,
        isHighestBidder: auction.current_highest_bidder_id === userId,
      },
    });
  } catch (error) {
    console.error(
      `[AUCTION_STATES] Error setting state for user ${userId}, auction ${auctionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Gestisce il cambio di miglior offerente
 */
export const handleBidderChange = async (
  auctionId: number,
  previousBidderId: string | null,
  newBidderId: string
): Promise<void> => {
  try {
    // Il nuovo miglior offerente va sempre in stato 'miglior_offerta'
    // (questo viene gestito automaticamente dalla query getUserAuctionState)

    // Se c'era un precedente miglior offerente, impostalo in 'rilancio_possibile'
    if (previousBidderId && previousBidderId !== newBidderId) {
      await setUserAuctionState(
        auctionId,
        previousBidderId,
        "rilancio_possibile"
      );

      // Salva timer per il countdown UI
      // Usa createResponseTimer per gestire correttamente lo stato offline/online
      await createResponseTimer(auctionId, previousBidderId);

      console.log(
        `[AUCTION_STATES] User ${previousBidderId} set to 'rilancio_possibile' via createResponseTimer`
      );
    }
  } catch (error) {
    console.error(`[AUCTION_STATES] Error handling bidder change:`, error);
    throw error;
  }
};

/**
 * Gestisce l'abbandono di un'asta
 */
export const handleAuctionAbandon = async (
  auctionId: number,
  userId: string
): Promise<void> => {
  try {
    // Imposta stato abbandonato
    await setUserAuctionState(auctionId, userId, "asta_abbandonata");

    // Trova l'offerta dell'utente per sbloccare i crediti
    const userBidResult = await db.execute({
      sql: `
        SELECT amount FROM bids
        WHERE auction_id = ? AND user_id = ?
        ORDER BY bid_time DESC LIMIT 1
      `,
      args: [auctionId, userId],
    });
    const userBid = userBidResult.rows[0]
      ? {
        amount: userBidResult.rows[0].amount as number
      }
      : undefined;

    // Trova la lega e il giocatore per aggiornare i crediti e il cooldown
    const auctionResult = await db.execute({
      sql: `
        SELECT auction_league_id, player_id FROM auctions WHERE id = ?
      `,
      args: [auctionId],
    });
    const auction = auctionResult.rows[0]
      ? {
        auction_league_id: auctionResult.rows[0].auction_league_id as number,
        player_id: auctionResult.rows[0].player_id as number
      }
      : undefined;

    // Rimuovi timer di risposta se esistente
    await db.execute({
      sql: `
        UPDATE user_auction_response_timers
        SET status = 'action_taken'
        WHERE auction_id = ? AND user_id = ? AND status = 'pending'
      `,
      args: [auctionId, userId],
    });

    // FIX: Rimosso sblocco crediti qui.
    // 1. Le offerte manuali NON bloccano crediti, quindi non c'è nulla da sbloccare.
    // 2. Gli auto-bid vengono sbloccati automaticamente da bid.service.ts quando vengono superati.
    // Sbloccare qui causava locked_credits negativi per offerte manuali e doppio sblocco per auto-bid.

    // Crea cooldown 48 ore
    if (auction) {
      const now = Math.floor(Date.now() / 1000);
      const cooldownEnd = now + 48 * 3600;

      // Usa INSERT OR REPLACE per gestire tentativi multipli di abbandono
      // Standardizzato su user_player_preferences con preference_type = 'cooldown'
      await db.execute({
        sql: `
          INSERT OR REPLACE INTO user_player_preferences
          (user_id, player_id, league_id, preference_type, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, 'cooldown', ?, ?, ?)
        `,
        args: [
          userId,
          auction.player_id,
          auction.auction_league_id,
          cooldownEnd,
          now,
          now,
        ],
      });

      console.log(
        `[AUCTION_STATES] User ${userId} abandoned auction ${auctionId}, 48h cooldown active`
      );
    }
  } catch (error) {
    console.error(`[AUCTION_STATES] Error handling auction abandon:`, error);
    throw error;
  }
};

/**
 * Ottiene tutti gli utenti con stato 'rilancio_possibile' per una lega
 */
export const getUsersWithPendingResponse = async (
  leagueId: number
): Promise<Array<{
  user_id: string;
  auction_id: number;
  player_id: number;
  player_name: string;
  response_deadline: number;
}>> => {
  const result = await db.execute({
    sql: `
    SELECT DISTINCT
      urt.user_id,
      urt.auction_id,
      a.player_id,
      p.name as player_name,
      urt.response_deadline
    FROM user_auction_response_timers urt
    JOIN auctions a ON urt.auction_id = a.id
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ?
      AND urt.status = 'pending'
      AND a.status = 'active'
    ORDER BY urt.response_deadline ASC
  `,
    args: [leagueId],
  });

  return result.rows.map(row => ({
    user_id: row.user_id as string,
    auction_id: row.auction_id as number,
    player_id: row.player_id as number,
    player_name: row.player_name as string,
    response_deadline: row.response_deadline as number,
  }));
};

/**
 * Processa i timer scaduti e imposta gli utenti come 'asta_abbandonata'
 */
export const processExpiredResponseStates = async (): Promise<{
  processedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  const errors: string[] = [];

  try {
    // Trova timer scaduti
    const expiredTimersResult = await db.execute({
      sql: `
      SELECT urt.auction_id, urt.user_id, a.player_id, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.status = 'pending'
        AND urt.response_deadline <= ?
        AND a.status = 'active'
    `,
      args: [now],
    });
    const expiredTimers = expiredTimersResult.rows.map(row => ({
      auction_id: row.auction_id as number,
      user_id: row.user_id as string,
      player_id: row.player_id as number,
      player_name: row.player_name as string,
    }));

    for (const timer of expiredTimers) {
      try {
        await handleAuctionAbandon(timer.auction_id, timer.user_id);
        processedCount++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(
          `User ${timer.user_id}, Auction ${timer.auction_id}: ${errorMsg}`
        );
      }
    }

    return { processedCount, errors };
  } catch (error) {
    console.error(
      "[AUCTION_STATES] Error processing expired response states:",
      error
    );
    throw error;
  }
};
