// src/lib/rate-limiter.ts
// Rate Limiter semplice in-memory per Fantavega

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Map per tracciare le richieste per utente
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiter semplice
 * @param userId - ID dell'utente
 * @param action - Tipo di azione (es: 'bid', 'auto-bid', 'view')
 * @param limit - Numero massimo di richieste
 * @param windowMs - Finestra temporale in millisecondi
 * @returns true se permesso, false se bloccato
 */
export function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number
): { allowed: boolean; resetTime?: number; remaining?: number } {
  const key = `${userId}:${action}`;
  const now = Date.now();

  // Ottieni o crea entry per questo utente/azione
  let entry = rateLimitStore.get(key);

  // Se non esiste o è scaduta, crea nuova entry
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);

    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: entry.resetTime,
    };
  }

  // Se ha superato il limite
  if (entry.count >= limit) {
    return {
      allowed: false,
      resetTime: entry.resetTime,
      remaining: 0,
    };
  }

  // Incrementa il contatore
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Configurazioni rate limit per Fantavega
 */
export const RATE_LIMITS = {
  // Offerte manuali: 10 per minuto
  BID_MANUAL: { limit: 10, windowMs: 60 * 1000 },

  // Auto-bid setup: 5 ogni 5 minuti
  BID_AUTO: { limit: 5, windowMs: 5 * 60 * 1000 },

  // Quick bid: 15 per minuto
  BID_QUICK: { limit: 15, windowMs: 60 * 1000 },

  // Visualizzazione aste: 60 per minuto
  VIEW_AUCTION: { limit: 60, windowMs: 60 * 1000 },

  // Admin operations: 30 per minuto
  ADMIN_ACTION: { limit: 30, windowMs: 60 * 1000 },
} as const;

/**
 * Helper per pulire entries scadute (opzionale, per memory management)
 */
export function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Pulizia automatica ogni 10 minuti
setInterval(cleanupExpiredEntries, 10 * 60 * 1000);
