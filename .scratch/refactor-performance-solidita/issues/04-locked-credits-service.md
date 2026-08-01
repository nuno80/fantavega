# 04 — Servizio centralizzato `locked_credits`

**What to build:** `locked-credits.service.ts` con `recalculateLockedCreditsForUser` e `recalculateLockedCreditsForUsers`. Query SQL `total_locked` scritta una sola volta. Calcola auto-bid attivi su aste `active`/`closing`, offerte manuali vincenti senza auto-bid, aggiorna `league_participants.locked_credits` nella transazione del chiamante, restituisce il valore, deduplica utenti nel batch. Sostituisce tutte le copie in `bid.service.ts`, `response-timer.service.ts` e `bid-expiry.ts` (se già estratto).

**Blocked by:** 03 — Await rollback transazionali

**Status:** ready-for-agent

- [ ] `src/lib/db/services/locked-credits.service.ts` creato
- [ ] Tipo `ExecuteClient = Pick<typeof db, "execute">` usato per compatibilità db/transazione
- [ ] Query SQL `total_locked` presente in un solo file
- [ ] `rg -n "total_locked" src/lib/db/services` trova solo `locked-credits.service.ts` (esclusi commenti autorizzati)
- [ ] Tutte le copie in bid/response-timer sostituite
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
