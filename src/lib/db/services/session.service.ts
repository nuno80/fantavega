import { db } from "@/lib/db";
import { processExpiredResponseTimers } from "./response-timer.service";
import { getGhostSessionEnd, isHeartbeatFresh, SESSION_STALENESS_SECONDS } from "./session-liveness";

export const isUniqueConflictError = (error: unknown): boolean => {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code?: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE";
  }
  if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
    return true;
  }
  return false;
};

const INSERT_SESSION_SQL = "INSERT INTO user_sessions (user_id, session_start, session_end, last_heartbeat) VALUES (?, ?, NULL, ?)";

export const recordUserLogin = async (userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    const active = await db.execute({ sql: "SELECT id FROM user_sessions WHERE user_id = ? AND session_end IS NULL LIMIT 1", args: [userId] });
    if (active.rows.length === 0) {
      await db.execute({ sql: INSERT_SESSION_SQL, args: [userId, now, now] });
    } else {
      await db.execute({ sql: "UPDATE user_sessions SET last_heartbeat = ? WHERE user_id = ? AND session_end IS NULL", args: [now, userId] });
    }
    await processExpiredResponseTimers();
  } catch (error) {
    console.error("[SESSION] Error recording login:", error);
  }
};

export const recordUserLogout = async (userId: string, notAfter?: number): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({
    sql: notAfter === undefined
      ? "UPDATE user_sessions SET session_end = ? WHERE user_id = ? AND session_end IS NULL"
      : "UPDATE user_sessions SET session_end = ? WHERE user_id = ? AND session_end IS NULL AND (last_heartbeat IS NULL OR last_heartbeat <= ?)",
    args: notAfter === undefined ? [now, userId] : [now, userId, notAfter],
  });
  if (result.rowsAffected > 0) console.log(`[SESSION] Closed ${result.rowsAffected} session for ${userId}`);
};

/** Returns the latest liveness timestamp, not the original login timestamp. */
export const getUserLastLogin = async (userId: string): Promise<number | null> => {
  const result = await db.execute({
    sql: "SELECT session_start, last_heartbeat FROM user_sessions WHERE user_id = ? AND session_end IS NULL ORDER BY session_start DESC LIMIT 1",
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return Math.max(Number(row.session_start), Number(row.last_heartbeat ?? 0));
};

export const isUserCurrentlyOnline = async (userId: string): Promise<boolean> => {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({ sql: "SELECT last_heartbeat FROM user_sessions WHERE user_id = ? AND session_end IS NULL LIMIT 1", args: [userId] });
  const heartbeat = result.rows[0]?.last_heartbeat == null ? null : Number(result.rows[0].last_heartbeat);
  return isHeartbeatFresh(heartbeat, now);
};

export const updateHeartbeat = async (userId: string): Promise<number> => {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.execute({ sql: "UPDATE user_sessions SET last_heartbeat = ? WHERE user_id = ? AND session_end IS NULL", args: [now, userId] });
  if (result.rowsAffected === 0) {
    try {
      await db.execute({ sql: INSERT_SESSION_SQL, args: [userId, now, now] });
    } catch (error) {
      if (!isUniqueConflictError(error)) throw error;
      // Un altro concorrente ha già inserito la sessione: riprova l'UPDATE una volta.
      const retry = await db.execute({ sql: "UPDATE user_sessions SET last_heartbeat = ? WHERE user_id = ? AND session_end IS NULL", args: [now, userId] });
      if (retry.rowsAffected === 0) {
        // Never return a timestamp that was not persisted: callers use it to start timers.
        throw new Error(`Heartbeat upsert failed after retry for ${userId}`);
      }
    }
  }
  return now;
};

export const reapGhostSessions = async (): Promise<number> => {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - SESSION_STALENESS_SECONDS;
  const result = await db.execute({ sql: "UPDATE user_sessions SET session_end = ? WHERE session_end IS NULL AND (last_heartbeat IS NULL OR last_heartbeat <= ?)", args: [now, cutoff] });
  return result.rowsAffected;
};

export const getUserSessionHistory = async (userId: string, days = 7): Promise<unknown[]> => {
  const result = await db.execute({ sql: "SELECT session_start, session_end, CASE WHEN session_end IS NULL THEN 'ACTIVE' ELSE (session_end - session_start) || ' seconds' END AS duration, datetime(session_start, 'unixepoch') AS start_readable, datetime(session_end, 'unixepoch') AS end_readable FROM user_sessions WHERE user_id = ? AND session_start > ? ORDER BY session_start DESC", args: [userId, Math.floor(Date.now() / 1000) - days * 86400] });
  return result.rows as unknown[];
};

export const getActiveUsers = async (): Promise<unknown[]> => {
  const result = await db.execute({ sql: "SELECT user_id, session_start, datetime(session_start, 'unixepoch') AS login_time FROM user_sessions WHERE session_end IS NULL ORDER BY session_start DESC", args: [] });
  return result.rows as unknown[];
};

export { getGhostSessionEnd };
