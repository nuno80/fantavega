/**
 * Servizio per la gestione delle sessioni utente
 * Traccia login/logout per calcolare correttamente i timer di risposta
 */
import { db } from "@/lib/db";

import {
  activateTimersForUser,
  processExpiredResponseTimers,
} from "./response-timer.service";

export const recordUserLogin = async (userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    // Check if user already has an active session
    const activeSessionResult = await db.execute({
      sql: `SELECT id FROM user_sessions WHERE user_id = ? AND session_end IS NULL`,
      args: [userId],
    });

    // If already has an active session, skip creating/reopening
    if (activeSessionResult.rows.length > 0) {
      // Session already active, just proceed to timer activation
    } else {
      // Use REPLACE INTO to handle race conditions:
      // - If no row exists: inserts new row
      // - If row exists (by user_id unique constraint): replaces it
      // This atomically handles the case where session was closed
      await db.execute({
        sql: `
          REPLACE INTO user_sessions (user_id, session_start, session_end)
          VALUES (?, ?, NULL)
        `,
        args: [userId, now],
      });
      console.log(`[SESSION] User ${userId} session opened/reopened at ${now}`);
    }

    // Prima processa timer scaduti globalmente (libera slot)
    try {
      const result = await processExpiredResponseTimers();
      if (result.processedCount > 0) {
        console.log(
          `[SESSION] Processed ${result.processedCount} expired timers at login`
        );
      }
    } catch (error) {
      console.error(
        "[SESSION] Error processing expired timers at login:",
        error
      );
      // Non bloccare il login per errori di processing
    }

    // Poi attiva timer pendenti per questo utente
    // Passa direttamente 'now' per evitare race condition con query concorrenti
    await activateTimersForUser(userId, now);
  } catch (error) {
    console.error("[SESSION] Error recording login:", error);
    // Don't throw, just log. This prevents blocking the UI if session tracking fails.
  }
};

export const recordUserLogout = async (userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await db.execute({
      sql: `
        UPDATE user_sessions
        SET session_end = ?
        WHERE user_id = ? AND session_end IS NULL
      `,
      args: [now, userId],
    });

    if (result.rowsAffected > 0) {
      console.log(`[SESSION] ✅ User ${userId} logged out at ${now} - ${result.rowsAffected} session(s) closed`);
    } else {
      console.log(`[SESSION] ⚠️ User ${userId} logout called but no active session found to close`);
    }
  } catch (error) {
    console.error("[SESSION] ❌ Error recording logout:", error);
    throw error;
  }
};

export const getUserLastLogin = async (userId: string): Promise<number | null> => {
  try {
    const result = await db.execute({
      sql: `
        SELECT session_start
        FROM user_sessions
        WHERE user_id = ? AND session_end IS NULL
        ORDER BY session_start DESC
        LIMIT 1
      `,
      args: [userId],
    });

    const session = result.rows[0]
      ? { session_start: result.rows[0].session_start as number }
      : undefined;
    return session?.session_start || null;
  } catch (error) {
    console.error("[SESSION] Error getting last login:", error);
    return null;
  }
};

export const isUserCurrentlyOnline = async (userId: string): Promise<boolean> => {
  try {
    const result = await db.execute({
      sql: `
        SELECT id FROM user_sessions
        WHERE user_id = ? AND session_end IS NULL
      `,
      args: [userId],
    });

    const isOnline = result.rows.length > 0;
    console.log(`[SESSION] isUserCurrentlyOnline(${userId}) = ${isOnline}`);
    return isOnline;
  } catch (error) {
    console.error("[SESSION] Error checking online status:", error);
    return false;
  }
};

export const getUserSessionHistory = async (userId: string, days = 7): Promise<unknown[]> => {
  try {
    const result = await db.execute({
      sql: `
        SELECT
          session_start,
          session_end,
          CASE
            WHEN session_end IS NULL THEN 'ACTIVE'
            ELSE (session_end - session_start) || ' seconds'
          END as duration,
          datetime(session_start, 'unixepoch') as start_readable,
          datetime(session_end, 'unixepoch') as end_readable
        FROM user_sessions
        WHERE user_id = ? AND session_start > ?
        ORDER BY session_start DESC
      `,
      args: [userId, Math.floor(Date.now() / 1000) - days * 24 * 3600],
    });

    return result.rows as unknown[];
  } catch (error) {
    console.error("[SESSION] Error getting session history:", error);
    return [];
  }
};

export const getActiveUsers = async (): Promise<unknown[]> => {
  try {
    const result = await db.execute({
      sql: `
        SELECT
          user_id,
          session_start,
          datetime(session_start, 'unixepoch') as login_time
        FROM user_sessions
        WHERE session_end IS NULL
        ORDER BY session_start DESC
      `,
      args: [],
    });

    return result.rows as unknown[];
  } catch (error) {
    console.error("[SESSION] Error getting active users:", error);
    return [];
  }
};
