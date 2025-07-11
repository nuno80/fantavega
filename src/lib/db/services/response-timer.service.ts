// src/lib/db/services/response-timer.service.ts
// Servizio per gestire i timer di risposta quando un utente viene superato in un'asta

import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

interface ResponseTimer {
  id: number;
  auction_id: number;
  user_id: string;
  notified_at: number;
  response_deadline: number;
  status: 'pending' | 'action_taken' | 'deadline_missed';
}

interface AuctionInfo {
  id: number;
  player_id: number;
  auction_league_id: number;
  player_name: string;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string;
}

// Costanti
const RESPONSE_TIME_HOURS = 1;
const ABANDON_COOLDOWN_HOURS = 48;

/**
 * Crea un timer di risposta quando un utente viene superato in un'asta
 */
export const createResponseTimer = async (
  auctionId: number,
  userId: string
): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + (RESPONSE_TIME_HOURS * 3600);

  try {
    // Verifica se esiste già un timer pending per questa combinazione
    const existingTimer = db.prepare(
      "SELECT id FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ? AND status = 'pending'"
    ).get(auctionId, userId) as { id: number } | undefined;

    if (existingTimer) {
      // Aggiorna il timer esistente
      db.prepare(
        "UPDATE user_auction_response_timers SET notified_at = ?, response_deadline = ? WHERE id = ?"
      ).run(now, deadline, existingTimer.id);
    } else {
      // Crea nuovo timer
      db.prepare(
        "INSERT INTO user_auction_response_timers (auction_id, user_id, notified_at, response_deadline, status) VALUES (?, ?, ?, ?, 'pending')"
      ).run(auctionId, userId, now, deadline);
    }

    // Invia notifica Socket.IO
    await notifySocketServer({
      room: `user-${userId}`,
      event: 'response-timer-started',
      data: {
        auctionId,
        deadline,
        timeRemaining: RESPONSE_TIME_HOURS * 3600
      }
    });

  } catch (error) {
    console.error(`[RESPONSE_TIMER] Error creating timer for user ${userId}, auction ${auctionId}:`, error);
    throw error;
  }
};

/**
 * Segna un timer come completato quando l'utente prende un'azione
 */
export const markTimerCompleted = async (
  auctionId: number,
  userId: string
): Promise<void> => {
  try {
    db.prepare(
      "UPDATE user_auction_response_timers SET status = 'action_taken' WHERE auction_id = ? AND user_id = ? AND status = 'pending'"
    ).run(auctionId, userId);
  } catch (error) {
    console.error(`[RESPONSE_TIMER] Error marking timer completed for user ${userId}, auction ${auctionId}:`, error);
    throw error;
  }
};

/**
 * Abbandona automaticamente le aste per utenti che non hanno risposto in tempo
 */
export const processExpiredResponseTimers = async (): Promise<{
  processedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  const errors: string[] = [];

  try {
    // Trova tutti i timer scaduti
    const expiredTimers = db.prepare(`
      SELECT urt.id, urt.auction_id, urt.user_id, urt.response_deadline,
             a.player_id, a.auction_league_id, p.name as player_name,
             a.current_highest_bid_amount, a.current_highest_bidder_id
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.status = 'pending' 
        AND urt.response_deadline <= ?
        AND a.status = 'active'
    `).all(now) as Array<ResponseTimer & AuctionInfo>;

    for (const timer of expiredTimers) {
      try {
        await db.transaction(() => {
          // Segna il timer come scaduto
          db.prepare(
            "UPDATE user_auction_response_timers SET status = 'deadline_missed' WHERE id = ?"
          ).run(timer.id);

          // Aggiungi alla tabella abandoned_auctions
          const cooldownEnd = now + (ABANDON_COOLDOWN_HOURS * 3600);
          db.prepare(
            "INSERT INTO abandoned_auctions (auction_id, user_id, abandoned_at, cooldown_ends_at) VALUES (?, ?, ?, ?)"
          ).run(timer.auction_id, timer.user_id, now, cooldownEnd);
        })();

        // Invia notifica di abbandono automatico
        await notifySocketServer({
          room: `user-${timer.user_id}`,
          event: 'auction-auto-abandoned',
          data: {
            playerName: timer.player_name,
            cooldownHours: ABANDON_COOLDOWN_HOURS,
            reason: 'Tempo di risposta scaduto'
          }
        });

        // Notifica alla lega dell'abbandono
        await notifySocketServer({
          room: `league-${timer.auction_league_id}`,
          event: 'user-abandoned-auction',
          data: {
            userId: timer.user_id,
            playerId: timer.player_id,
            playerName: timer.player_name,
            reason: 'timeout'
          }
        });

        processedCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Timer ID ${timer.id}: ${errorMsg}`);
      }
    }

    return { processedCount, errors };
  } catch (error) {
    console.error('[RESPONSE_TIMER] Error processing expired timers:', error);
    throw error;
  }
};

/**
 * Ottieni i timer di risposta attivi per un utente
 */
export const getUserActiveResponseTimers = (userId: string): Array<ResponseTimer & { player_name: string }> => {
  return db.prepare(`
    SELECT urt.*, p.name as player_name
    FROM user_auction_response_timers urt
    JOIN auctions a ON urt.auction_id = a.id
    JOIN players p ON a.player_id = p.id
    WHERE urt.user_id = ? AND urt.status = 'pending' AND a.status = 'active'
    ORDER BY urt.response_deadline ASC
  `).all(userId) as Array<ResponseTimer & { player_name: string }>;
};

/**
 * Verifica se un utente può fare offerte per un giocatore (non in cooldown)
 */
export const canUserBidOnPlayer = (userId: string, playerId: number): boolean => {
  const now = Math.floor(Date.now() / 1000);
  
  const cooldownCheck = db.prepare(`
    SELECT 1 FROM abandoned_auctions aa
    JOIN auctions a ON aa.auction_id = a.id
    WHERE aa.user_id = ? AND a.player_id = ? AND aa.cooldown_ends_at > ?
  `).get(userId, playerId, now);

  return !cooldownCheck;
};