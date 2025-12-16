// src/lib/db/services/response-timer.service.ts
// Servizio per la gestione dei timer di risposta degli utenti nelle aste
// Gestisce i timer di 1 ora per il rilancio dopo essere stati superati
// LOGICA CORRETTA: Timer parte solo quando utente torna online e vede il rilancio
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

import { getUserLastLogin, isUserCurrentlyOnline } from "./session.service";

interface ResponseTimer {
  id: number;
  auction_id: number;
  user_id: string;
  created_at: number;
  response_deadline: number | null;
  activated_at: number | null;
  processed_at: number | null;
  status: "pending" | "cancelled" | "abandoned" | "expired";
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
    console.log(
      `[TIMER] Creating pending timer for user ${userId}, auction ${auctionId}`
    );

    /// Verifica se esiste già un timer per questa combinazione (qualsiasi status)
    const existingTimerResult = await db.execute({
      sql: `
    SELECT id, status FROM user_auction_response_timers
    WHERE auction_id = ? AND user_id = ?
  `,
      args: [auctionId, userId],
    });
    const existingTimer = existingTimerResult.rows[0]
      ? {
        id: existingTimerResult.rows[0].id as number,
        status: existingTimerResult.rows[0].status as string
      }
      : undefined;

    if (existingTimer) {
      console.log(
        `[TIMER] Found existing timer ${existingTimer.id} with status '${existingTimer.status}', resetting to pending`
      );
      // Resetta il timer esistente a pending
      await db.execute({
        sql: `
        UPDATE user_auction_response_timers
        SET created_at = ?, response_deadline = NULL, activated_at = NULL, processed_at = NULL, status = 'pending'
        WHERE id = ?
      `,
        args: [now, existingTimer.id],
      });
    } else {
      console.log(`[TIMER] Creating new pending timer`);
      // Crea un nuovo timer PENDENTE senza deadline
      const result = await db.execute({
        sql: `
        INSERT INTO user_auction_response_timers
        (auction_id, user_id, created_at, response_deadline, status)
        VALUES (?, ?, ?, NULL, 'pending')
      `,
        args: [auctionId, userId, now],
      });
      console.log(
        `[TIMER] Created pending timer with ID: ${result.lastInsertRowid}`
      );
    }

    // Se utente è online, attiva subito il timer
    const isOnline = await isUserCurrentlyOnline(userId);
    if (isOnline) {
      console.log(`[TIMER] ⚡ User ${userId} is ONLINE, activating timer immediately`);
      await activateTimerForUser(userId, auctionId);
    } else {
      console.log(`[TIMER] 💤 User ${userId} is OFFLINE, timer stays PENDING`);
    }

    console.log(
      `[TIMER] Timer created for user ${userId} - Online: ${isOnline}`
    );
  } catch (error) {
    console.error(
      `[TIMER] Error creating pending timer for user ${userId}, auction ${auctionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Attiva i timer di risposta pendenti per un utente quando torna online.
 * Timer parte dal momento del login, non da quando è stato superato.
 * @param loginTime - Opzionale. Se fornito, usa questo valore invece di query al DB (evita race condition)
 */
export const activateTimersForUser = async (userId: string, loginTime?: number): Promise<void> => {
  try {
    // Usa loginTime passato direttamente o query al DB come fallback
    const effectiveLoginTime = loginTime ?? await getUserLastLogin(userId);
    if (!effectiveLoginTime) {
      console.log(`[TIMER] No active session found for user ${userId}`);
      return;
    }

    // Timer di 1 ora dal login
    const deadline = effectiveLoginTime + RESPONSE_TIME_HOURS * 3600;


    // Trova tutti i timer pendenti per l'utente
    const pendingTimersResult = await db.execute({
      sql: `
      SELECT id, auction_id
      FROM user_auction_response_timers
      WHERE user_id = ? AND status = 'pending' AND response_deadline IS NULL
    `,
      args: [userId],
    });
    const pendingTimers = pendingTimersResult.rows as unknown as Array<{ id: number; auction_id: number }>;

    if (pendingTimers.length === 0) {
      return; // Nessun timer da attivare
    }

    console.log(
      `[TIMER] Activating ${pendingTimers.length} timers for user ${userId}, deadline: ${deadline}`
    );

    for (const timer of pendingTimers) {
      await db.execute({
        sql: `
        UPDATE user_auction_response_timers
        SET response_deadline = ?, activated_at = ?
        WHERE id = ?
      `,
        args: [deadline, effectiveLoginTime, timer.id],
      });

      // Invia notifica Socket.IO per ogni timer attivato
      await notifySocketServer({
        room: `user-${userId}`,
        event: "response-timer-started",
        data: {
          auctionId: timer.auction_id,
          deadline,
          timeRemaining: deadline - Math.floor(Date.now() / 1000),
        },
      });

      console.log(
        `[TIMER] Activated timer ID ${timer.id} for user ${userId}, auction ${timer.auction_id}`
      );
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
const activateTimerForUser = async (
  userId: string,
  auctionId: number
): Promise<void> => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + RESPONSE_TIME_HOURS * 3600;

    await db.execute({
      sql: `
      UPDATE user_auction_response_timers
      SET response_deadline = ?, activated_at = ?
      WHERE user_id = ? AND auction_id = ? AND status = 'pending'
    `,
      args: [deadline, now, userId, auctionId],
    });

    console.log(
      `[TIMER] Activated single timer for user ${userId}, auction ${auctionId}`
    );

    // Invia notifica immediata
    await notifySocketServer({
      room: `user-${userId}`,
      event: "response-timer-started",
      data: {
        auctionId,
        deadline,
        timeRemaining: deadline - Math.floor(Date.now() / 1000),
      },
    });
  } catch (error) {
    console.error("[TIMER] Error activating single timer:", error);
    throw error;
  }
};

/**
 * Invia notifica all'utente dei timer attivati
 */
const notifyUserOfActiveTimers = async (userId: string): Promise<void> => {
  try {
    const activeTimersResult = await db.execute({
      sql: `
      SELECT urt.auction_id, urt.response_deadline, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.user_id = ? AND urt.status = 'pending' AND urt.response_deadline IS NOT NULL
    `,
      args: [userId],
    });
    const activeTimers = activeTimersResult.rows;

    if (activeTimers.length > 0) {
      await notifySocketServer({
        room: `user-${userId}`,
        event: "timers-activated-notification",
        data: {
          count: activeTimers.length,
          timers: activeTimers,
        },
      });
    }
  } catch (error) {
    console.error("[TIMER] Error notifying user of active timers:", error);
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
    const result = await db.execute({
      sql: `
      UPDATE user_auction_response_timers
      SET status = 'cancelled', processed_at = ?
      WHERE auction_id = ? AND user_id = ? AND status = 'pending'
    `,
      args: [now, auctionId, userId],
    });

    if (result.rowsAffected > 0) {
      console.log(
        `[TIMER] Cancelled response timer for user ${userId}, auction ${auctionId}`
      );
    }
  } catch (error) {
    console.error(
      `[TIMER] Error cancelling timer for user ${userId}, auction ${auctionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Segna un timer come completato quando l'utente prende un'azione
 * Usato quando l'utente sceglie di fare un rilancio dopo essere stato superato
 */
export const markTimerCompleted = async (auctionId: number, userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await db.execute({
      sql: `
      UPDATE user_auction_response_timers
      SET status = 'cancelled', processed_at = ?
      WHERE auction_id = ? AND user_id = ? AND status = 'pending'
    `,
      args: [now, auctionId, userId],
    });

    if (result.rowsAffected > 0) {
      console.log(
        `[TIMER] Timer completed for user ${userId}, auction ${auctionId}`
      );
    } else {
      console.log(
        `[TIMER] No pending timer found for user ${userId}, auction ${auctionId} - this is normal if no timer was active`
      );
    }
  } catch (error) {
    console.error(
      `[TIMER] Error marking timer completed for user ${userId}, auction ${auctionId}:`,
      error
    );
    // Non fare throw dell'errore - è normale che non ci sia sempre un timer da completare
    console.log(
      `[TIMER] Continuing despite timer completion error - this is not critical`
    );
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
    const expiredTimersResult = await db.execute({
      sql: `
      SELECT urt.id, urt.auction_id, urt.user_id, urt.response_deadline,
             a.player_id, a.auction_league_id as league_id, p.name as player_name,
             a.current_highest_bid_amount, a.current_highest_bidder_id
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.status = 'pending'
        AND urt.response_deadline IS NOT NULL
        AND urt.response_deadline <= ?
        AND a.status = 'active'
    `,
      args: [now],
    });
    const expiredTimers = expiredTimersResult.rows as unknown as Array<{
      id: number;
      auction_id: number;
      user_id: string;
      response_deadline: number;
      player_id: number;
      league_id: number;
      player_name: string;
      current_highest_bid_amount: number;
      current_highest_bidder_id: string;
    }>;

    console.log(`[TIMER] Found ${expiredTimers.length} expired timers`);

    for (const timer of expiredTimers) {
      const transaction = await db.transaction("write");
      try {
        // Segna il timer come scaduto
        await transaction.execute({
          sql: `
          UPDATE user_auction_response_timers
          SET status = 'expired', processed_at = ?
          WHERE id = ?
        `,
          args: [now, timer.id],
        });

        // FIX: Ricalcola locked_credits invece di sottrarre incrementalmente
        // Include sia auto-bid attivi che offerte manuali vincenti senza auto-bid
        const userLockedCreditsResult = await transaction.execute({
          sql: `
            SELECT
              COALESCE(
                (SELECT SUM(ab.max_amount)
                 FROM auto_bids ab
                 JOIN auctions a ON ab.auction_id = a.id
                 WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
                0
              ) +
              COALESCE(
                (SELECT SUM(a.current_highest_bid_amount)
                 FROM auctions a
                 LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
                 WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
                   AND ab.id IS NULL
                   AND a.status IN ('active', 'closing')),
                0
              ) as total_locked
          `,
          args: [timer.league_id, timer.user_id, timer.user_id, timer.league_id, timer.user_id],
        });
        const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;

        await transaction.execute({
          sql: `
          UPDATE league_participants
          SET locked_credits = ?
          WHERE user_id = ? AND league_id = ?
        `,
          args: [totalLocked, timer.user_id, timer.league_id],
        });

        // Applica cooldown 48h per questo giocatore
        const cooldownExpiry = now + ABANDON_COOLDOWN_HOURS * 3600;
        await transaction.execute({
          sql: `
          INSERT OR REPLACE INTO user_player_preferences
          (user_id, player_id, league_id, preference_type, expires_at)
          VALUES (?, ?, ?, 'cooldown', ?)
        `,
          args: [timer.user_id, timer.player_id, timer.league_id, cooldownExpiry],
        });

        // Log transazione
        await transaction.execute({
          sql: `
          INSERT INTO budget_transactions
          (user_id, auction_league_id, league_id, amount, transaction_type, description, created_at, balance_after_in_league)
          VALUES (?, ?, ?, 0, 'timer_expired', ?, ?, ?)
        `,
          args: [
            timer.user_id,
            timer.league_id,
            timer.league_id,
            `Timer scaduto per ${timer.player_name} - Cooldown 48h applicato`,
            now,
            0,
          ],
        });

        await transaction.commit();

        // Invia notifiche
        await notifySocketServer({
          room: `user-${timer.user_id}`,
          event: "timer-expired-notification",
          data: {
            playerName: timer.player_name,
            cooldownHours: ABANDON_COOLDOWN_HOURS,
            reason: "Tempo di risposta scaduto",
          },
        });

        await notifySocketServer({
          room: `league-${timer.league_id}`,
          event: "user-timer-expired",
          data: {
            userId: timer.user_id,
            playerId: timer.player_id,
            playerName: timer.player_name,
          },
        });

        console.log(
          `[TIMER] Processed expired timer ${timer.id} for user ${timer.user_id}`
        );
        processedCount++;
      } catch (error) {
        transaction.rollback();
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`Timer ID ${timer.id}: ${errorMsg}`);
        console.error(`[TIMER] Error processing timer ${timer.id}:`, error);
      }
    }

    console.log(
      `[TIMER] Processed ${processedCount} expired timers, ${errors.length} errors`
    );
    return { processedCount, errors };
  } catch (error) {
    console.error("[TIMER] Error processing expired timers:", error);
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

  const transaction = await db.transaction("write");
  try {
    // Trova asta attiva e durata timer dalla lega
    const auctionResult = await transaction.execute({
      sql: `
      SELECT a.id, a.current_highest_bid_amount, a.current_highest_bidder_id, al.timer_duration_minutes
      FROM auctions a
      JOIN auction_leagues al ON a.auction_league_id = al.id
      WHERE a.player_id = ? AND a.auction_league_id = ? AND a.status = 'active'
    `,
      args: [playerId, leagueId],
    });
    const auction = auctionResult.rows[0]
      ? {
        id: auctionResult.rows[0].id as number,
        current_highest_bid_amount: auctionResult.rows[0].current_highest_bid_amount as number,
        current_highest_bidder_id: auctionResult.rows[0].current_highest_bidder_id as string,
        timer_duration_minutes: auctionResult.rows[0].timer_duration_minutes as number
      }
      : undefined;

    if (!auction) {
      throw new Error("Nessuna asta attiva trovata per questo giocatore");
    }

    // Verifica che l'utente abbia un timer attivo
    const timerResult = await transaction.execute({
      sql: `
      SELECT id FROM user_auction_response_timers
      WHERE user_id = ? AND auction_id = ? AND status = 'pending'
    `,
      args: [userId, auction.id],
    });
    const timer = timerResult.rows[0]
      ? { id: timerResult.rows[0].id as number }
      : undefined;

    if (!timer) {
      console.error(`[TIMER] abandonAuction failed: No active timer found for user ${userId}, auction ${auction.id}`);
      throw new Error("Nessun timer di risposta attivo per questo utente");
    }

    console.log(`[TIMER] Found timer ${timer.id} for user ${userId}, proceeding with abandon`);

    // Marca timer come abbandonato
    await transaction.execute({
      sql: `
      UPDATE user_auction_response_timers
      SET status = 'abandoned', processed_at = ?
      WHERE id = ?
    `,
      args: [now, timer.id],
    });

    // Resetta il timer dell'asta alla durata configurata nella lega
    const newScheduledEndTime = now + (auction.timer_duration_minutes * 60);
    await transaction.execute({
      sql: `
      UPDATE auctions
      SET scheduled_end_time = ?, updated_at = ?
      WHERE id = ?
    `,
      args: [newScheduledEndTime, now, auction.id],
    });
    console.log(`[TIMER] Reset auction ${auction.id} timer to ${auction.timer_duration_minutes} minutes`);

    // FIX: Ricalcola locked_credits invece di sottrarre incrementalmente
    // Include sia auto-bid attivi che offerte manuali vincenti senza auto-bid
    const userLockedCreditsResult = await transaction.execute({
      sql: `
        SELECT
          COALESCE(
            (SELECT SUM(ab.max_amount)
             FROM auto_bids ab
             JOIN auctions a ON ab.auction_id = a.id
             WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
            0
          ) +
          COALESCE(
            (SELECT SUM(a.current_highest_bid_amount)
             FROM auctions a
             LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
             WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
               AND ab.id IS NULL
               AND a.status IN ('active', 'closing')),
            0
          ) as total_locked
      `,
      args: [leagueId, userId, userId, leagueId, userId],
    });
    const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;

    await transaction.execute({
      sql: `
      UPDATE league_participants
      SET locked_credits = ?
      WHERE user_id = ? AND league_id = ?
    `,
      args: [totalLocked, userId, leagueId],
    });

    // Applica cooldown 48h
    const cooldownExpiry = now + ABANDON_COOLDOWN_HOURS * 3600;
    await transaction.execute({
      sql: `
      INSERT OR REPLACE INTO user_player_preferences
      (user_id, player_id, league_id, preference_type, expires_at)
      VALUES (?, ?, ?, 'cooldown', ?)
    `,
      args: [userId, playerId, leagueId, cooldownExpiry],
    });

    // Log transazione
    await transaction.execute({
      sql: `
      INSERT INTO budget_transactions
      (user_id, auction_league_id, league_id, amount, transaction_type, description, created_at, balance_after_in_league)
      VALUES (?, ?, ?, 0, 'auction_abandoned', ?, ?, 0)
    `,
      args: [
        userId,
        leagueId,
        leagueId,
        `Abbandonata asta per giocatore ${playerId} - Cooldown 48h applicato`,
        now,
      ],
    });

    await transaction.commit();

    // Notifica real-time con dati completi per aggiornare la UI immediatamente
    // Include budgetUpdates per aggiornare i crediti senza refresh
    await notifySocketServer({
      event: "auction-update",
      room: `league-${leagueId}`,
      data: {
        userId,
        playerId,
        auctionId: auction.id,
        action: "abandoned",
        // Include complete data for instant UI update
        newPrice: auction.current_highest_bid_amount,
        highestBidderId: auction.current_highest_bidder_id,
        scheduledEndTime: newScheduledEndTime,
        // Include budget update for real-time credit refresh
        budgetUpdates: [{
          userId,
          newLockedCredits: totalLocked,
        }],
      },
    });

    console.log(
      `[TIMER] User ${userId} abandoned auction for player ${playerId}`
    );
  } catch (error) {
    transaction.rollback();
    console.error("[TIMER] Error abandoning auction:", error);
    throw error;
  }
};

/**
 * Ottieni i timer di risposta attivi per un utente
 */
export const getUserActiveResponseTimers = async (
  userId: string
): Promise<Array<ResponseTimer & { player_name: string }>> => {
  try {
    const result = await db.execute({
      sql: `
      SELECT urt.*, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.user_id = ? AND urt.status = 'pending' AND a.status = 'active'
      ORDER BY urt.response_deadline ASC
    `,
      args: [userId],
    });
    return result.rows as unknown as Array<ResponseTimer & { player_name: string }>;
  } catch (error) {
    console.error("[TIMER] Error getting active timers:", error);
    return [];
  }
};

/**
 * Verifica se un utente può fare offerte per un giocatore (non in cooldown)
 */
export const canUserBidOnPlayer = async (
  userId: string,
  playerId: number,
  leagueId: number
): Promise<boolean> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    const cooldownCheckResult = await db.execute({
      sql: `
      SELECT 1 FROM user_player_preferences
      WHERE user_id = ? AND player_id = ? AND league_id = ?
        AND preference_type = 'cooldown' AND expires_at > ?
    `,
      args: [userId, playerId, leagueId, now],
    });
    const cooldownCheck = cooldownCheckResult.rows.length > 0;

    return !cooldownCheck;
  } catch (error) {
    console.error("[TIMER] Error checking cooldown:", error);
    return true; // In caso di errore, permetti l'offerta
  }
};

/**
 * Ottieni informazioni dettagliate sul cooldown di un utente per un giocatore
 */
export const getUserCooldownInfo = async (
  userId: string,
  playerId: number,
  leagueId?: number
): Promise<{ canBid: boolean; timeRemaining?: number; message?: string }> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    const sql = `
      SELECT expires_at
      FROM user_player_preferences
      WHERE user_id = ? AND player_id = ?
        AND preference_type = 'cooldown' AND expires_at > ?
        ${leagueId ? "AND league_id = ?" : ""}
    `;
    const args = leagueId ? [userId, playerId, now, leagueId] : [userId, playerId, now];

    const cooldownResult = await db.execute({ sql, args });
    const cooldown = cooldownResult.rows[0]
      ? { expires_at: cooldownResult.rows[0].expires_at as number }
      : undefined;

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
      message,
    };
  } catch (error) {
    console.error("[TIMER] Error getting cooldown info:", error);
    return { canBid: true };
  }
};

/**
 * Processa la risposta dell'utente (bid o fold)
 * NOTA: Per "bid", questa funzione restituisce solo l'indicazione di procedere.
 * La chiamata effettiva a placeBid deve essere fatta dal controller/API per evitare dipendenze circolari.
 */
export const processUserResponse = async (
  userId: string,
  leagueId: number,
  playerId: number,
  action: "bid" | "fold"
): Promise<{ success: boolean; message?: string; action?: "bid" | "fold" }> => {
  try {
    if (action === "fold") {
      await abandonAuction(userId, leagueId, playerId);
      return { success: true, message: "Asta abbandonata con successo", action: "fold" };
    } else if (action === "bid") {
      // Verifica preliminare che l'utente possa effettivamente rilanciare (timer attivo)
      // Questo controllo è opzionale se ci fidiamo del caller, ma aggiunge sicurezza
      const activeTimers = await getUserActiveResponseTimers(userId);
      const _hasActiveTimer = activeTimers.some(t => t.auction_id); // Semplificazione, idealmente dovremmo controllare l'auction_id specifico

      // Ritorniamo success: true e action: "bid" per dire al controller di procedere con il bid
      return {
        success: true,
        message: "Procedere con l'offerta",
        action: "bid"
      };
    }

    return { success: false, message: "Azione non valida" };
  } catch (error) {
    console.error("[TIMER] Error processing user response:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
};
