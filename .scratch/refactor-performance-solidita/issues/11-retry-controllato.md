# 11 — Retry controllato

**What to build:** `retry-utils.ts` con `withRetry()`: backoff esponenziale, limite massimo di tentativi, log finale. Applicato solo a compliance check idempotenti e operazioni protette da `UPDATE ... WHERE` o chiave univoca. Non applicato a INSERT ledger, assegnazione giocatori, penalità senza idempotency key, notifiche con side-effect. `void withRetry(fn, options)` per fire-and-forget.

**Blocked by:** 07 — Batch aste scadute

**Status:** ready-for-agent

- [ ] `src/lib/db/services/retry-utils.ts` creato
- [ ] Backoff esponenziale con limite massimo
- [ ] Log finale su fallimento
- [ ] Applicato solo a operazioni dichiaratamente idempotenti
- [ ] `void` per fire-and-forget
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
