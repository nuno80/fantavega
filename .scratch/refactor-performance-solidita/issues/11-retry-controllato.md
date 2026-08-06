# 11 — Retry controllato

**What to build:** `retry-utils.ts` con `withRetry()`: backoff esponenziale, limite massimo di tentativi, log finale. Applicato solo a compliance check idempotenti e operazioni protette da `UPDATE ... WHERE` o chiave univoca. Non applicato a INSERT ledger, assegnazione giocatori, penalità senza idempotency key, notifiche con side-effect. `void withRetry(fn, options)` per fire-and-forget.

**Blocked by:** 07 — Batch aste scadute

**Status:** done

- [x] `src/lib/db/services/retry-utils.ts` creato
- [x] Backoff esponenziale con limite massimo
- [x] Log finale su fallimento
- [x] Applicato solo a operazioni dichiaratamente idempotenti
- [x] `void` per fire-and-forget
- [x] `pnpm run type-check` passa
- [x] `pnpm run test:run` passa
