// src/lib/db/services/response-timer.service.ts
// Servizio per la gestione dei timer di risposta degli utenti nelle aste
// Gestisce i timer di 1 ora per il rilancio dopo essere stati superati
// LOGICA CORRETTA: Timer parte solo quando utente torna online e vede il rilancio
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

import { getUserLastLogin } from "./session.service";

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

const RESPONSE_TIME_HOURS = 1;
const ABANDON_COOLDOWN_HOURS = 48;

export const createResponseTimer = async (auctionId: number, userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    const existingTimerResult = await db.execute({
      sql: `SELECT id, status FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ?`,
      args: [auctionId, userId],
    });
    const existingTimer = existingTimerResult.rows[0]
      ? { id: existingTimerResult.rows[0].id as number, status: existingTimerResult.rows[0].status as string }
      : undefined;

    if (existingTimer) {
      await db.execute({
        sql: `UPDATE user_auction_response_timers SET created_at = ?, response_deadline = NULL, activated_at = NULL, processed_at = NULL, status = 'pending' WHERE id = ?`,
        args: [now, existingTimer.id],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO user_auction_response_timers (auction_id, user_id, created_at, response_deadline, status) VALUES (?, ?, ?, NULL, 'pending')`,
        args: [auctionId, userId, now],
      });
    }
  } catch (error) {
    console.error(`[TIMER] Error creating pending timer for user ${userId}, auction ${auctionId}:`, error);
    throw error;
  }
};

export const activateTimersForUser = async (userId: string, loginTime?: number): Promise<void> => {
  try {
    const effectiveLoginTime = loginTime ?? await getUserLastLogin(userId);
    if (!effectiveLoginTime) return;
    const deadline = effectiveLoginTime + RESPONSE_TIME_HOURS * 3600;
    const pendingTimersResult = await db.execute({
      sql: `SELECT id, auction_id FROM user_auction_response_timers WHERE user_id = ? AND status = 'pending' AND response_deadline IS NULL`,
      args: [userId],
    });
    const pendingTimers = pendingTimersResult.rows as unknown as Array<{ id: number; auction_id: number }>;
    for (const timer of pendingTimers) {
      const activation = await db.execute({
        sql: `UPDATE user_auction_response_timers SET response_deadline = ?, activated_at = ? WHERE id = ? AND status = 'pending' AND response_deadline IS NULL`,
        args: [deadline, effectiveLoginTime, timer.id],
      });
      if (activation.rowsAffected === 0) continue;
      await notifySocketServer({ room: `user-${userId}`, event: "response-timer-started", data: { auctionId: timer.auction_id, deadline, timeRemaining: deadline - Math.floor(Date.now() / 1000) } });
    }
    await notifyUserOfActiveTimers(userId);
  } catch (error) {
    console.error(`[TIMER] Error activating timers for user ${userId}:`, error);
  }
};

const notifyUserOfActiveTimers = async (userId: string): Promise<void> => {
  try {
    const activeTimersResult = await db.execute({
      sql: `SELECT urt.auction_id, urt.response_deadline, p.name as player_name FROM user_auction_response_timers urt JOIN auctions a ON urt.auction_id = a.id JOIN players p ON a.player_id = p.id WHERE urt.user_id = ? AND urt.status = 'pending' AND urt.response_deadline IS NOT NULL`,
      args: [userId],
    });
    if (activeTimersResult.rows.length > 0) {
      await notifySocketServer({ room: `user-${userId}`, event: "timers-activated-notification", data: { count: activeTimersResult.rows.length, timers: activeTimersResult.rows } });
    }
  } catch (error) {
    console.error("[TIMER] Error notifying user of active timers:", error);
  }
};

export const cancelResponseTimer = async (auctionId: number, userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({ sql: `UPDATE user_auction_response_timers SET status = 'cancelled', processed_at = ? WHERE auction_id = ? AND user_id = ? AND status = 'pending'`, args: [now, auctionId, userId] });
  if (result.rowsAffected > 0) console.log(`[TIMER] Cancelled response timer for user ${userId}, auction ${auctionId}`);
};

export const markTimerCompleted = async (auctionId: number, userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.execute({ sql: `UPDATE user_auction_response_timers SET status = 'cancelled', processed_at = ? WHERE auction_id = ? AND user_id = ? AND status = 'pending'`, args: [now, auctionId, userId] });
  } catch (error) {
    console.error(`[TIMER] Error marking timer completed for user ${userId}, auction ${auctionId}:`, error);
  }
};

export const processExpiredResponseTimers = async (): Promise<{ processedCount: number; errors: string[] }> => {
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  const errors: string[] = [];
  try {
    const expiredTimersResult = await db.execute({ sql: `SELECT urt.id, urt.auction_id, urt.user_id, urt.response_deadline, a.player_id, a.auction_league_id as league_id, p.name as player_name, a.current_highest_bid_amount, a.current_highest_bidder_id FROM user_auction_response_timers urt JOIN auctions a ON urt.auction_id = a.id JOIN players p ON a.player_id = p.id WHERE urt.status = 'pending' AND urt.response_deadline IS NOT NULL AND urt.response_deadline <= ? AND a.status = 'active'`, args: [now] });
    const expiredTimers = expiredTimersResult.rows as unknown as Array<{ id: number; auction_id: number; user_id: string; response_deadline: number; player_id: number; league_id: number; player_name: string; current_highest_bid_amount: number; current_highest_bidder_id: string }>;
    for (const timer of expiredTimers) {
      const transaction = await db.transaction("write");
      try {
        const expiryResult = await transaction.execute({ sql: `UPDATE user_auction_response_timers SET status = 'expired', processed_at = ? WHERE id = ? AND status = 'pending' AND response_deadline IS NOT NULL AND response_deadline <= ?`, args: [now, timer.id, now] });
        if (expiryResult.rowsAffected === 0) { await transaction.rollback(); continue; }
        const userLockedCreditsResult = await transaction.execute({ sql: `SELECT COALESCE((SELECT SUM(ab.max_amount) FROM auto_bids ab JOIN auctions a ON ab.auction_id = a.id WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')), 0) + COALESCE((SELECT SUM(a.current_highest_bid_amount) FROM auctions a LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND ab.id IS NULL AND a.status IN ('active', 'closing')), 0) as total_locked`, args: [timer.league_id, timer.user_id, timer.user_id, timer.league_id, timer.user_id] });
        const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;
        await transaction.execute({ sql: `UPDATE league_participants SET locked_credits = ? WHERE user_id = ? AND league_id = ?`, args: [totalLocked, timer.user_id, timer.league_id] });
        await transaction.execute({ sql: `INSERT OR REPLACE INTO user_player_preferences (user_id, player_id, league_id, preference_type, expires_at) VALUES (?, ?, ?, 'cooldown', ?)`, args: [timer.user_id, timer.player_id, timer.league_id, now + ABANDON_COOLDOWN_HOURS * 3600] });
        await transaction.execute({ sql: `INSERT INTO budget_transactions (user_id, auction_league_id, league_id, amount, transaction_type, description, created_at, balance_after_in_league) VALUES (?, ?, ?, 0, 'timer_expired', ?, ?, ?)`, args: [timer.user_id, timer.league_id, timer.league_id, `Timer scaduto per ${timer.player_name} - Cooldown 48h applicato`, now, 0] });
        await transaction.commit();
        processedCount++;
      } catch (error) {
        await transaction.rollback();
        errors.push(`Timer ID ${timer.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    return { processedCount, errors };
  } catch (error) {
    console.error("[TIMER] Error processing expired timers:", error);
    throw error;
  }
};

export const abandonAuction = async (userId: string, leagueId: number, playerId: number): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  const transaction = await db.transaction("write");
  try {
    const auctionResult = await transaction.execute({ sql: `SELECT a.id, a.current_highest_bid_amount, a.current_highest_bidder_id, al.timer_duration_minutes FROM auctions a JOIN auction_leagues al ON a.auction_league_id = al.id WHERE a.player_id = ? AND a.auction_league_id = ? AND a.status = 'active'`, args: [playerId, leagueId] });
    const auction = auctionResult.rows[0] ? { id: auctionResult.rows[0].id as number, current_highest_bid_amount: auctionResult.rows[0].current_highest_bid_amount as number, current_highest_bidder_id: auctionResult.rows[0].current_highest_bidder_id as string, timer_duration_minutes: auctionResult.rows[0].timer_duration_minutes as number } : undefined;
    if (!auction) throw new Error("Nessuna asta attiva trovata per questo giocatore");
    const timerResult = await transaction.execute({ sql: `SELECT id FROM user_auction_response_timers WHERE user_id = ? AND auction_id = ? AND status = 'pending'`, args: [userId, auction.id] });
    const timer = timerResult.rows[0] ? { id: timerResult.rows[0].id as number } : undefined;
    if (!timer) throw new Error("Nessun timer di risposta attivo per questo utente");
    const abandonResult = await transaction.execute({ sql: `UPDATE user_auction_response_timers SET status = 'abandoned', processed_at = ? WHERE id = ? AND status = 'pending'`, args: [now, timer.id] });
    if (abandonResult.rowsAffected === 0) throw new Error("Impossibile abbandonare: il timer è già stato processato o non è più pendente");
    const newScheduledEndTime = now + auction.timer_duration_minutes * 60;
    await transaction.execute({ sql: `UPDATE auctions SET scheduled_end_time = ?, updated_at = ? WHERE id = ?`, args: [newScheduledEndTime, now, auction.id] });
    const userLockedCreditsResult = await transaction.execute({ sql: `SELECT COALESCE((SELECT SUM(ab.max_amount) FROM auto_bids ab JOIN auctions a ON ab.auction_id = a.id WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')), 0) + COALESCE((SELECT SUM(a.current_highest_bid_amount) FROM auctions a LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND ab.id IS NULL AND a.status IN ('active', 'closing')), 0) as total_locked`, args: [leagueId, userId, userId, leagueId, userId] });
    const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;
    await transaction.execute({ sql: `UPDATE league_participants SET locked_credits = ? WHERE user_id = ? AND league_id = ?`, args: [totalLocked, userId, leagueId] });
    await transaction.execute({ sql: `INSERT OR REPLACE INTO user_player_preferences (user_id, player_id, league_id, preference_type, expires_at) VALUES (?, ?, ?, 'cooldown', ?)`, args: [userId, playerId, leagueId, now + ABANDON_COOLDOWN_HOURS * 3600] });
    await transaction.execute({ sql: `INSERT INTO budget_transactions (user_id, auction_league_id, league_id, amount, transaction_type, description, created_at, balance_after_in_league) VALUES (?, ?, ?, 0, 'auction_abandoned', ?, ?, 0)`, args: [userId, leagueId, leagueId, `Abbandonata asta per giocatore ${playerId} - Cooldown 48h applicato`, now] });
    await transaction.commit();
    await notifySocketServer({ event: "auction-update", room: `league-${leagueId}`, data: { userId, playerId, auctionId: auction.id, action: "abandoned", newPrice: auction.current_highest_bid_amount, highestBidderId: auction.current_highest_bidder_id, scheduledEndTime: newScheduledEndTime, budgetUpdates: [{ userId, newLockedCredits: totalLocked }] } });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const getUserActiveResponseTimers = async (userId: string): Promise<Array<ResponseTimer & { player_name: string }>> => {
  try {
    const result = await db.execute({ sql: `SELECT urt.*, p.name as player_name FROM user_auction_response_timers urt JOIN auctions a ON urt.auction_id = a.id JOIN players p ON a.player_id = p.id WHERE urt.user_id = ? AND urt.status = 'pending' AND a.status = 'active' ORDER BY urt.response_deadline ASC`, args: [userId] });
    return result.rows as unknown as Array<ResponseTimer & { player_name: string }>;
  } catch (error) {
    console.error("[TIMER] Error getting active timers:", error);
    return [];
  }
};

export const canUserBidOnPlayer = async (userId: string, playerId: number, leagueId: number): Promise<boolean> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    const cooldownCheckResult = await db.execute({ sql: `SELECT 1 FROM user_player_preferences WHERE user_id = ? AND player_id = ? AND league_id = ? AND preference_type = 'cooldown' AND expires_at > ?`, args: [userId, playerId, leagueId, now] });
    return cooldownCheckResult.rows.length === 0;
  } catch (error) {
    console.error("[TIMER] Error checking cooldown:", error);
    return false;
  }
};

export const getUserCooldownInfo = async (userId: string, playerId: number, leagueId?: number): Promise<{ canBid: boolean; timeRemaining?: number; message?: string }> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    const sql = `SELECT expires_at FROM user_player_preferences WHERE user_id = ? AND player_id = ? AND preference_type = 'cooldown' AND expires_at > ? ${leagueId ? "AND league_id = ?" : ""}`;
    const args = leagueId ? [userId, playerId, now, leagueId] : [userId, playerId, now];
    const cooldownResult = await db.execute({ sql, args });
    const cooldown = cooldownResult.rows[0] ? { expires_at: cooldownResult.rows[0].expires_at as number } : undefined;
    if (!cooldown) return { canBid: true };
    const timeRemaining = cooldown.expires_at - now;
    return { canBid: false, timeRemaining, message: `Hai abbandonato l'asta per questo giocatore! Riprova tra ${Math.floor(timeRemaining / 3600)}h ${Math.floor((timeRemaining % 3600) / 60)}m` };
  } catch (error) {
    console.error("[TIMER] Error getting cooldown info:", error);
    return { canBid: false, message: "Impossibile verificare il cooldown. Riprova tra poco." };
  }
};

export const processUserResponse = async (userId: string, leagueId: number, playerId: number, action: "bid" | "fold"): Promise<{ success: boolean; message?: string; action?: "bid" | "fold" }> => {
  try {
    if (action === "fold") {
      await abandonAuction(userId, leagueId, playerId);
      return { success: true, message: "Asta abbandonata con successo", action: "fold" };
    }
    if (action === "bid") return { success: true, message: "Procedere con l'offerta", action: "bid" };
    return { success: false, message: "Azione non valida" };
  } catch (error) {
    console.error("[TIMER] Error processing user response:", error);
    return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
};
