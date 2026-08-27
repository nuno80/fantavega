// src/lib/rate-limiter.ts — Distributed rate limiter backed by Turso
// ponytail: uses the existing DB instead of adding Redis. Fail-open on DB errors.
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RateLimitResult {
  allowed: boolean;
  resetTime?: number;
  remaining?: number;
}

/**
 * Distributed rate limiter using Turso.
 *
 * Uses atomic INSERT ON CONFLICT to avoid read-then-write races.
 * Fail-open: if the DB query fails, the request is allowed.
 */
export async function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const expiresAt = now + windowMs;

  try {
    // Atomic upsert: insert if new/expired, increment if existing and within window.
    // If the row is expired (expires_at <= now), reset it.
    const result = await db.execute({
      sql: `INSERT INTO rate_limit_counters (key, count, expires_at)
            VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET
              count = CASE
                WHEN rate_limit_counters.expires_at <= ? THEN 1
                ELSE rate_limit_counters.count + 1
              END,
              expires_at = CASE
                WHEN rate_limit_counters.expires_at <= ? THEN ?
                ELSE rate_limit_counters.expires_at
              END
            RETURNING count, expires_at`,
      args: [key, expiresAt, now, now, expiresAt],
    });

    const row = result.rows[0];
    const count = Number(row.count);
    const resetTime = Number(row.expires_at);

    if (count > limit) {
      return { allowed: false, remaining: 0, resetTime };
    }
    return { allowed: true, remaining: limit - count, resetTime };
  } catch (error) {
    // Fail-open: allow the request if the rate limit check itself fails
    logger.error("rate limiter DB error, failing open", { error });
    return { allowed: true, remaining: limit, resetTime: expiresAt };
  }
}

/**
 * Rate limit configurations for Fantavega.
 */
export const RATE_LIMITS = {
  // Offerte manuali: 10 per minuto
  BID_MANUAL: { limit: 10, windowMs: 60_000 },

  // Auto-bid setup: 5 ogni 5 minuti
  BID_AUTO: { limit: 5, windowMs: 5 * 60_000 },

  // Quick bid: 15 per minuto
  BID_QUICK: { limit: 15, windowMs: 60_000 },

  // Visualizzazione aste: 60 per minuto
  VIEW_AUCTION: { limit: 60, windowMs: 60_000 },

  // Admin operations: 30 per minuto
  ADMIN_ACTION: { limit: 30, windowMs: 60_000 },

  // General API: 120 per minuto
  API_GENERAL: { limit: 120, windowMs: 60_000 },
} as const;
