// src/lib/db/services/retry-utils.ts
// Retry controllato per operazioni idempotenti.
// DA USARE SOLO con operazioni dichiaratamente idempotenti:
// compliance check, UPDATE ... WHERE protetti, insert protetti da chiave univoca.
// NON usare per: INSERT ledger, assegnazione giocatori, penalità senza
// idempotency key, notifiche con side-effect.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Esegue `fn` con backoff esponenziale (base * 2^attempt), fino a `maxAttempts`.
 * Se tutti i tentativi falliscono, logga l'errore finale e rilancia.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delay);
    }
  }
  console.error(
    `[RETRY] Operazione fallita dopo ${maxAttempts} tentativi:`,
    lastError
  );
  throw lastError;
}
