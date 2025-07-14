// src/lib/db/services/auction-states.service.ts
// Servizio per gestire gli stati dei giocatori nelle aste

import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

// Stati possibili per un utente in un'asta
export type UserAuctionState = 
  | 'miglior_offerta'      // Verde - sei il miglior offerente
  | 'rilancio_possibile'   // Rosso - puoi rilanciare o abbandonare
  | 'asta_abbandonata';    // Grigio - hai abbandonato, cooldown attivo

interface UserAuctionStates {
  [userId: string]: UserAuctionState;
}

interface AuctionStateInfo {
  auction_id: number;
  player_id: number;
  player_name: string;
  current_highest_bidder_id: string;
  user_auction_states: string; // JSON string
}

/**
 * Ottiene lo stato di un utente per un'asta specifica
 */
export const getUserAuctionState = (auctionId: number, userId: string): UserAuctionState => {
  try {
    const auction = db.prepare(`
      SELECT user_auction_states, current_highest_bidder_id 
      FROM auctions 
      WHERE id = ?
    `).get(auctionId) as { user_auction_states: string; current_highest_bidder_id: string } | undefined;

    if (!auction) {
      return 'miglior_offerta'; // Default se asta non trovata
    }

    // Se sei il miglior offerente, sei sempre in stato 'miglior_offerta'
    if (auction.current_highest_bidder_id === userId) {
      return 'miglior_offerta';
    }

    // Altrimenti controlla gli stati salvati
    const states: UserAuctionStates = auction.user_auction_states 
      ? JSON.parse(auction.user_auction_states) 
      : {};

    return states[userId] || 'miglior_offerta';
  } catch (error) {
    console.error(`[AUCTION_STATES] Error getting state for user ${userId}, auction ${auctionId}:`, error);
    return 'miglior_offerta';
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
    const auction = db.prepare(`
      SELECT user_auction_states, current_highest_bidder_id, player_id
      FROM auctions a
      WHERE a.id = ?
    `).get(auctionId) as { 
      user_auction_states: string; 
      current_highest_bidder_id: string;
      player_id: number;
    } | undefined;

    if (!auction) {
      throw new Error(`Auction ${auctionId} not found`);
    }

    const currentStates: UserAuctionStates = auction.user_auction_states 
      ? JSON.parse(auction.user_auction_states) 
      : {};

    // Aggiorna lo stato dell'utente
    currentStates[userId] = state;

    // Salva nel database
    db.prepare(`
      UPDATE auctions 
      SET user_auction_states = ? 
      WHERE id = ?
    `).run(JSON.stringify(currentStates), auctionId);

    console.log(`[AUCTION_STATES] Set state '${state}' for user ${userId} in auction ${auctionId}`);

    // Invia notifica Socket.IO per aggiornamento UI
    await notifySocketServer({
      room: `user-${userId}`,
      event: 'auction-state-changed',
      data: {
        auctionId,
        playerId: auction.player_id,
        newState: state,
        isHighestBidder: auction.current_highest_bidder_id === userId
      }
    });

  } catch (error) {
    console.error(`[AUCTION_STATES] Error setting state for user ${userId}, auction ${auctionId}:`, error);
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
      await setUserAuctionState(auctionId, previousBidderId, 'rilancio_possibile');
      
      // Crea timer per il countdown (1 ora)
      const deadline = Math.floor(Date.now() / 1000) + (1 * 3600); // 1 ora
      
      // Salva timer per il countdown UI
      db.prepare(`
        INSERT OR REPLACE INTO user_auction_response_timers 
        (auction_id, user_id, notified_at, response_deadline, status) 
        VALUES (?, ?, ?, ?, 'pending')
      `).run(auctionId, previousBidderId, Math.floor(Date.now() / 1000), deadline);
      
      console.log(`[AUCTION_STATES] User ${previousBidderId} set to 'rilancio_possibile' with 1h timer`);
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
    await setUserAuctionState(auctionId, userId, 'asta_abbandonata');
    
    // Trova l'offerta dell'utente per sbloccare i crediti
    const userBid = db.prepare(`
      SELECT amount FROM bids 
      WHERE auction_id = ? AND user_id = ? 
      ORDER BY bid_time DESC LIMIT 1
    `).get(auctionId, userId) as { amount: number } | undefined;

    // Trova la lega per aggiornare i crediti
    const auction = db.prepare(`
      SELECT auction_league_id FROM auctions WHERE id = ?
    `).get(auctionId) as { auction_league_id: number } | undefined;
    
    // Rimuovi timer di risposta se esistente
    db.prepare(`
      UPDATE user_auction_response_timers 
      SET status = 'action_taken' 
      WHERE auction_id = ? AND user_id = ? AND status = 'pending'
    `).run(auctionId, userId);
    
    // Sblocca i crediti dell'utente se aveva fatto un'offerta
    if (userBid && auction) {
      db.prepare(`
        UPDATE league_participants 
        SET locked_credits = locked_credits - ? 
        WHERE league_id = ? AND user_id = ?
      `).run(userBid.amount, auction.auction_league_id, userId);
    }
    
    // Crea cooldown 48 ore
    const now = Math.floor(Date.now() / 1000);
    const cooldownEnd = now + (48 * 3600);
    
    // Usa INSERT OR REPLACE per gestire tentativi multipli di abbandono
    db.prepare(`
      INSERT OR REPLACE INTO user_auction_cooldowns 
      (auction_id, user_id, abandoned_at, cooldown_ends_at) 
      VALUES (?, ?, ?, ?)
    `).run(auctionId, userId, now, cooldownEnd);
    
    console.log(`[AUCTION_STATES] User ${userId} abandoned auction ${auctionId}, 48h cooldown active`);

  } catch (error) {
    console.error(`[AUCTION_STATES] Error handling auction abandon:`, error);
    throw error;
  }
};

/**
 * Ottiene tutti gli utenti con stato 'rilancio_possibile' per una lega
 */
export const getUsersWithPendingResponse = (leagueId: number): Array<{
  user_id: string;
  auction_id: number;
  player_id: number;
  player_name: string;
  response_deadline: number;
}> => {
  return db.prepare(`
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
  `).all(leagueId) as Array<{
    user_id: string;
    auction_id: number;
    player_id: number;
    player_name: string;
    response_deadline: number;
  }>;
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
    const expiredTimers = db.prepare(`
      SELECT urt.auction_id, urt.user_id, a.player_id, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.status = 'pending' 
        AND urt.response_deadline <= ?
        AND a.status = 'active'
    `).all(now) as Array<{
      auction_id: number;
      user_id: string;
      player_id: number;
      player_name: string;
    }>;

    for (const timer of expiredTimers) {
      try {
        await handleAuctionAbandon(timer.auction_id, timer.user_id);
        processedCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`User ${timer.user_id}, Auction ${timer.auction_id}: ${errorMsg}`);
      }
    }

    return { processedCount, errors };
  } catch (error) {
    console.error('[AUCTION_STATES] Error processing expired response states:', error);
    throw error;
  }
};

/**
 * Ottiene tutti gli stati delle aste per un utente in una specifica lega.
 */
export const getAllUserAuctionStatesForLeague = (userId: string, leagueId: number): { states: any[] } => {
  try {
    const activeAuctions = db.prepare(`
      SELECT 
        a.id as auction_id,
        a.player_id,
        p.name as player_name,
        a.current_highest_bid as current_bid,
        a.current_highest_bidder_id,
        a.user_auction_states,
        urt.response_deadline
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending'
      WHERE a.auction_league_id = ? AND a.status = 'active'
    `).all(userId, leagueId) as { 
      auction_id: number; 
      player_id: number;
      player_name: string;
      current_bid: number;
      current_highest_bidder_id: string;
      user_auction_states: string;
      response_deadline: number | null;
    }[];

    const states = activeAuctions.map(auction => {
      const isHighestBidder = auction.current_highest_bidder_id === userId;
      let userState: UserAuctionState = 'miglior_offerta';

      if (!isHighestBidder) {
        const parsedStates: UserAuctionStates = auction.user_auction_states ? JSON.parse(auction.user_auction_states) : {};
        userState = parsedStates[userId] || 'rilancio_possibile'; // Default to rilancio_possibile if not the highest bidder
      }
      
      const timeRemaining = auction.response_deadline ? Math.max(0, auction.response_deadline - Math.floor(Date.now() / 1000)) : null;

      return {
        auction_id: auction.auction_id,
        player_id: auction.player_id,
        player_name: auction.player_name,
        current_bid: auction.current_bid,
        user_state: userState,
        response_deadline: auction.response_deadline,
        time_remaining: timeRemaining,
        is_highest_bidder: isHighestBidder,
      };
    });

    return { states };
  } catch (error) {
    console.error(`[AUCTION_STATES] Error getting all states for user ${userId} in league ${leagueId}:`, error);
    return { states: [] };
  }
};
