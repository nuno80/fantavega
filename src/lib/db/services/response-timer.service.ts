/**
 * Servizio per la gestione dei timer di risposta degli utenti nelle aste
 * Gestisce i timer di 1 ora per il rilancio dopo essere stati superati
 * LOGICA CORRETTA: Timer parte solo quando utente torna online e vede il rilancio
 */

import { db } from '@/lib/db';
import { notifySocketServer } from '@/lib/socket-emitter';
import { getUserLastLogin, isUserCurrentlyOnline } from './session.service';

interface ResponseTimer {
  id: number;
  auction_id: number;
  user_id: string;
  created_at: number;
  response_deadline: number | null;
  activated_at: number | null;
  processed_at: number | null;
  status: 'pending' | 'cancelled' | 'abandoned' | 'expired';
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
 * Crea un timer di risposta PENDENTE quando un utente viene superato.
 * Il timer non ha una scadenza finché l'utente non torna online.
 */
export const createResponseTimer = async (
  auctionId: number,
  userId: string
): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    console.log(`[TIMER] Creating pending timer for user ${userId}, auction ${auctionId}`);

    // Verifica se esiste già un timer pending per questa combinazione
    const existingTimer = await db.get(`
      SELECT id FROM user_auction_response_timers 
      WHERE auction_id = ? AND user_id = ? AND status = 'pending'
    `, auctionId, userId) as { id: number } | undefined;

    if (existingTimer) {
      console.log(`[TIMER] Resetting existing pending timer ${existingTimer.id}`);
      // Resetta il timer esistente
      await db.run(`
        UPDATE user_auction_response_timers 
        SET created_at = ?, response_deadline = NULL, activated_at = NULL, processed_at = NULL
        WHERE id = ?
      `, now, existingTimer.id);
    } else {
      console.log(`[TIMER] Creating new pending timer`);
      // Crea un nuovo timer PENDENTE senza deadline
      const result = await db.run(`
        INSERT INTO user_auction_response_timers 
        (auction_id, user_id, created_at, response_deadline, status) 
        VALUES (?, ?, ?, NULL, 'pending')
      `, auctionId, userId, now);
      console.log(`[TIMER] Created pending timer with ID: ${result.lastID}`);
    }

    // Se utente è online, attiva subito il timer
    if (await isUserCurrentlyOnline(userId)) {
      await activateTimerForUser(userId, auctionId);
    }

    console.log(`[TIMER] Pending timer created successfully for user ${userId}`);

  } catch (error) {
    console.error(`[TIMER] Error creating pending timer for user ${userId}, auction ${auctionId}:`, error);
    throw error;
  }
};

/**
 * Attiva i timer di risposta pendenti per un utente quando torna online.
 * Timer parte dal momento del login, non da quando è stato superato.
 */
export const activateTimersForUser = async (userId: string): Promise<void> => {
  try {
    // Trova quando l'utente è tornato online
    const loginTime = await getUserLastLogin(userId);
    if (!loginTime) {
      console.log(`[TIMER] No active session found for user ${userId}`);
      return;
    }

    // Timer di 1 ora dal login
    const deadline = loginTime + (RESPONSE_TIME_HOURS * 3600);

    // Trova tutti i timer pendenti per l'utente
    const pendingTimers = await db.all(`
      SELECT id, auction_id 
      FROM user_auction_response_timers 
      WHERE user_id = ? AND status = 'pending' AND response_deadline IS NULL
    `, userId) as Array<{ id: number, auction_id: number }>;

    if (pendingTimers.length === 0) {
      return; // Nessun timer da attivare
    }

    console.log(`[TIMER] Activating ${pendingTimers.length} timers for user ${userId}, deadline: ${deadline}`);

    for (const timer of pendingTimers) {
      await db.run(`
        UPDATE user_auction_response_timers 
        SET response_deadline = ?, activated_at = ?
        WHERE id = ?
      `, deadline, loginTime, timer.id);

      // Invia notifica Socket.IO per ogni timer attivato
      await notifySocketServer({
        room: `user-${userId}`,
        event: 'response-timer-started',
        data: {
          auctionId: timer.auction_id,
          deadline,
          timeRemaining: deadline - Math.floor(Date.now() / 1000)
        }
      });

      console.log(`[TIMER] Activated timer ID ${timer.id} for user ${userId}, auction ${timer.auction_id}`);
    }

    // Invia notifica generale di timer attivati
    await notifyUserOfActiveTimers(userId);

  } catch (error) {
    console.error(`[TIMER] Error activating timers for user ${userId}:`, error);
    // Non rilanciare l'errore per non bloccare il login
  }
};

/**
 * Attiva un singolo timer per un utente (quando è online al momento del rilancio)
 */
const activateTimerForUser = async (userId: string, auctionId: number): Promise<void> => {
  try {
    const loginTime = await getUserLastLogin(userId);
    if (!loginTime) return;

    const deadline = loginTime + (RESPONSE_TIME_HOURS * 3600);

    await db.run(`
      UPDATE user_auction_response_timers 
      SET response_deadline = ?, activated_at = ?
      WHERE user_id = ? AND auction_id = ? AND status = 'pending'
    `, deadline, loginTime, userId, auctionId);

    console.log(`[TIMER] Activated single timer for user ${userId}, auction ${auctionId}`);

    // Invia notifica immediata
    await notifySocketServer({
      room: `user-${userId}`,
      event: 'response-timer-started',
      data: {
        auctionId,
        deadline,
        timeRemaining: deadline - Math.floor(Date.now() / 1000)
      }
    });

  } catch (error) {
    console.error('[TIMER] Error activating single timer:', error);
    throw error;
  }
};

/**
 * Invia notifica all'utente dei timer attivati
 */
const notifyUserOfActiveTimers = async (userId: string): Promise<void> => {
  try {
    const activeTimers = await db.all(`
      SELECT urt.auction_id, urt.response_deadline, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.user_id = ? AND urt.status = 'pending' AND urt.response_deadline IS NOT NULL
    `, userId);

    if (activeTimers.length > 0) {
      await notifySocketServer({
        room: `user-${userId}`,
        event: 'timers-activated-notification',
        data: {
          count: activeTimers.length,
          timers: activeTimers
        }
      });
    }
  } catch (error) {
    console.error('[TIMER] Error notifying user of active timers:', error);
  }
};

/**
 * Cancella un timer quando l'utente rilancia (non serve più)
 */
export const cancelResponseTimer = async (
  auctionId: number,
  userId: string
): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const result = await db.run(`
      UPDATE user_auction_response_timers 
      SET status = 'cancelled', processed_at = ?
      WHERE auction_id = ? AND user_id = ? AND status = 'pending'
    `, now, auctionId, userId);
    
    if (result.changes > 0) {
      console.log(`[TIMER] Cancelled response timer for user ${userId}, auction ${auctionId}`);
    }
  } catch (error) {
    console.error(`[TIMER] Error cancelling timer for user ${userId}, auction ${auctionId}:`, error);
    throw error;
  }
};

/**
 * Processa i timer scaduti e sblocca automaticamente le slot
 */
export const processExpiredResponseTimers = async (): Promise<{
  processedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  const errors: string[] = [];

  try {
    console.log(`[TIMER] Processing expired timers at ${now}`);

    // Trova tutti i timer scaduti
    const expiredTimers = await db.all(`
      SELECT urt.id, urt.auction_id, urt.user_id, urt.response_deadline,
             a.player_id, a.league_id, p.name as player_name,
             a.current_highest_bid_amount, a.current_highest_bidder_id
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.status = 'pending' 
        AND urt.response_deadline IS NOT NULL
        AND urt.response_deadline <= ?
        AND a.status = 'active'
    `, now) as Array<ResponseTimer & AuctionInfo>;

    console.log(`[TIMER] Found ${expiredTimers.length} expired timers`);

    for (const timer of expiredTimers) {
      try {
        await db.run('BEGIN TRANSACTION');

        // Segna il timer come scaduto
        await db.run(`
          UPDATE user_auction_response_timers 
          SET status = 'expired', processed_at = ?
          WHERE id = ?
        `, now, timer.id);

        // Sblocca i crediti dell'utente
        await db.run(`
          UPDATE league_participants 
          SET locked_credits = locked_credits - ?
          WHERE user_id = ? AND league_id = ?
        `, timer.current_highest_bid_amount, timer.user_id, timer.league_id);

        // Applica cooldown 48h per questo giocatore
        const cooldownExpiry = now + (ABANDON_COOLDOWN_HOURS * 3600);
        await db.run(`
          INSERT OR REPLACE INTO user_player_preferences 
          (user_id, player_id, league_id, preference_type, expires_at)
          VALUES (?, ?, ?, 'cooldown', ?)
        `, timer.user_id, timer.player_id, timer.league_id, cooldownExpiry);

        // Log transazione
        await db.run(`
          INSERT INTO budget_transactions 
          (user_id, league_id, amount, transaction_type, description, created_at)
          VALUES (?, ?, 0, 'timer_expired', ?, ?)
        `, timer.user_id, timer.league_id, 
           `Timer scaduto per ${timer.player_name} - Cooldown 48h applicato`, now);

        await db.run('COMMIT');

        // Invia notifiche
        await notifySocketServer({
          room: `user-${timer.user_id}`,
          event: 'timer-expired-notification',
          data: {
            playerName: timer.player_name,
            cooldownHours: ABANDON_COOLDOWN_HOURS,
            reason: 'Tempo di risposta scaduto'
          }
        });

        await notifySocketServer({
          room: `league-${timer.league_id}`,
          event: 'user-timer-expired',
          data: {
            userId: timer.user_id,
            playerId: timer.player_id,
            playerName: timer.player_name
          }
        });

        console.log(`[TIMER] Processed expired timer ${timer.id} for user ${timer.user_id}`);
        processedCount++;

      } catch (error) {
        await db.run('ROLLBACK');
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Timer ID ${timer.id}: ${errorMsg}`);
        console.error(`[TIMER] Error processing timer ${timer.id}:`, error);
      }
    }

    console.log(`[TIMER] Processed ${processedCount} expired timers, ${errors.length} errors`);
    return { processedCount, errors };

  } catch (error) {
    console.error('[TIMER] Error processing expired timers:', error);
    throw error;
  }
};

/**
 * Abbandona volontariamente un'asta
 */
export const abandonAuction = async (
  userId: string,
  leagueId: number,
  playerId: number
): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    await db.run('BEGIN TRANSACTION');

    // Trova asta attiva
    const auction = await db.get(`
      SELECT id, current_highest_bid_amount 
      FROM auctions 
      WHERE player_id = ? AND league_id = ? AND status = 'active'
    `, playerId, leagueId) as { id: number; current_highest_bid_amount: number } | undefined;

    if (!auction) {
      throw new Error('Nessuna asta attiva trovata per questo giocatore');
    }

    // Verifica che l'utente abbia un timer attivo
    const timer = await db.get(`
      SELECT id FROM user_auction_response_timers 
      WHERE user_id = ? AND auction_id = ? AND status = 'pending'
    `, userId, auction.id) as { id: number } | undefined;

    if (!timer) {
      throw new Error('Nessun timer di risposta attivo per questo utente');
    }

    // Marca timer come abbandonato
    await db.run(`
      UPDATE user_auction_response_timers 
      SET status = 'abandoned', processed_at = ?
      WHERE id = ?
    `, now, timer.id);

    // Sblocca crediti
    await db.run(`
      UPDATE league_participants 
      SET locked_credits = locked_credits - ?
      WHERE user_id = ? AND league_id = ?
    `, auction.current_highest_bid_amount, userId, leagueId);

    // Applica cooldown 48h
    const cooldownExpiry = now + (ABANDON_COOLDOWN_HOURS * 3600);
    await db.run(`
      INSERT OR REPLACE INTO user_player_preferences 
      (user_id, player_id, league_id, preference_type, expires_at)
      VALUES (?, ?, ?, 'cooldown', ?)
    `, userId, playerId, leagueId, cooldownExpiry);

    // Log transazione
    await db.run(`
      INSERT INTO budget_transactions 
      (user_id, league_id, amount, transaction_type, description, created_at)
      VALUES (?, ?, 0, 'auction_abandoned', ?, ?)
    `, userId, leagueId, `Abbandonata asta per giocatore ${playerId} - Cooldown 48h applicato`, now);

    await db.run('COMMIT');

    // Notifica real-time
    await notifySocketServer({
      event: 'auction-abandoned',
      room: `league-${leagueId}`,
      data: {
        userId,
        playerId,
        auctionId: auction.id,
        cooldownExpiry
      }
    });

    console.log(`[TIMER] User ${userId} abandoned auction for player ${playerId}`);

  } catch (error) {
    await db.run('ROLLBACK');
    console.error('[TIMER] Error abandoning auction:', error);
    throw error;
  }
};

/**
 * Ottieni i timer di risposta attivi per un utente
 */
export const getUserActiveResponseTimers = async (userId: string): Promise<Array<ResponseTimer & { player_name: string }>> => {
  try {
    return await db.all(`
      SELECT urt.*, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.user_id = ? AND urt.status = 'pending' AND a.status = 'active'
      ORDER BY urt.response_deadline ASC
    `, userId) as Array<ResponseTimer & { player_name: string }>;
  } catch (error) {
    console.error('[TIMER] Error getting active timers:', error);
    return [];
  }
};

/**
 * Verifica se un utente può fare offerte per un giocatore (non in cooldown)
 */
export const canUserBidOnPlayer = async (userId: string, playerId: number, leagueId: number): Promise<boolean> => {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const cooldownCheck = await db.get(`
      SELECT 1 FROM user_player_preferences
      WHERE user_id = ? AND player_id = ? AND league_id = ? 
        AND preference_type = 'cooldown' AND expires_at > ?
    `, userId, playerId, leagueId, now);

    return !cooldownCheck;
  } catch (error) {
    console.error('[TIMER] Error checking cooldown:', error);
    return true; // In caso di errore, permetti l'offerta
  }
};

/**
 * Ottieni informazioni dettagliate sul cooldown di un utente per un giocatore
 */
export const getUserCooldownInfo = async (userId: string, playerId: number, leagueId: number): Promise<{ canBid: boolean; timeRemaining?: number; message?: string }> => {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const cooldown = await db.get(`
      SELECT expires_at 
      FROM user_player_preferences
      WHERE user_id = ? AND player_id = ? AND league_id = ? 
        AND preference_type = 'cooldown' AND expires_at > ?
    `, userId, playerId, leagueId, now) as { expires_at: number } | undefined;
    
    if (!cooldown) {
      return { canBid: true };
    }
    
    const timeRemaining = cooldown.expires_at - now;
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    
    const message = `Hai abbandonato l'asta per questo giocatore! Riprova tra ${hours}h ${minutes}m`;
    
    return { 
      canBid: false, 
      timeRemaining,
      message 
    };
  } catch (error) {
    console.error('[TIMER] Error getting cooldown info:', error);
    return { canBid: true };
  }
};
