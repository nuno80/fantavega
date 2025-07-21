/**
 * Servizio per la gestione delle sessioni utente
 * Traccia login/logout per calcolare correttamente i timer di risposta
 */

import { db } from '@/lib/db';
import { activateTimersForUser } from './response-timer.service';

export const recordUserLogin = async (userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    // Chiudi eventuali sessioni precedenti rimaste aperte
    await db.run(`
      UPDATE user_sessions 
      SET session_end = ? 
      WHERE user_id = ? AND session_end IS NULL
    `, now, userId);
    
    // Crea nuova sessione
    await db.run(`
      INSERT INTO user_sessions (user_id, session_start) 
      VALUES (?, ?)
    `, userId, now);
    
    console.log(`[SESSION] User ${userId} logged in at ${now}`);
    
    // Attiva timer pendenti
    await activateTimersForUser(userId);
    
  } catch (error) {
    console.error('[SESSION] Error recording login:', error);
    throw error;
  }
};

export const recordUserLogout = async (userId: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  
  try {
    const result = await db.run(`
      UPDATE user_sessions 
      SET session_end = ? 
      WHERE user_id = ? AND session_end IS NULL
    `, now, userId);
    
    if (result.changes > 0) {
      console.log(`[SESSION] User ${userId} logged out at ${now}`);
    }
    
  } catch (error) {
    console.error('[SESSION] Error recording logout:', error);
    throw error;
  }
};

export const getUserLastLogin = async (userId: string): Promise<number | null> => {
  try {
    const session = await db.get(`
      SELECT session_start 
      FROM user_sessions 
      WHERE user_id = ? AND session_end IS NULL
      ORDER BY session_start DESC 
      LIMIT 1
    `, userId);
    
    return session?.session_start || null;
  } catch (error) {
    console.error('[SESSION] Error getting last login:', error);
    return null;
  }
};

export const isUserCurrentlyOnline = async (userId: string): Promise<boolean> => {
  try {
    const activeSession = await db.get(`
      SELECT id FROM user_sessions 
      WHERE user_id = ? AND session_end IS NULL
    `, userId);
    
    return !!activeSession;
  } catch (error) {
    console.error('[SESSION] Error checking online status:', error);
    return false;
  }
};

export const getUserSessionHistory = async (userId: string, days = 7) => {
  try {
    const sessions = await db.all(`
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
    `, userId, Math.floor(Date.now() / 1000) - (days * 24 * 3600));
    
    return sessions;
  } catch (error) {
    console.error('[SESSION] Error getting session history:', error);
    return [];
  }
};

export const getActiveUsers = async () => {
  try {
    return await db.all(`
      SELECT 
        user_id,
        session_start,
        datetime(session_start, 'unixepoch') as login_time
      FROM user_sessions 
      WHERE session_end IS NULL
      ORDER BY session_start DESC
    `);
  } catch (error) {
    console.error('[SESSION] Error getting active users:', error);
    return [];
  }
};