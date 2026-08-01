# 07 — Batch aste scadute

**What to build:** `processExpiredAuctionsAndAssignPlayers()` processa al massimo 50 aste per invocazione, ordinate per `scheduled_end_time ASC`. Se il batch è pieno, logga un messaggio informativo. Nessuna modifica al filtro sulle aste senza offerente.

**Blocked by:** 06 — Estrazione `bid-expiry.ts`

**Status:** ready-for-agent

- [ ] `BATCH_SIZE = 50` definito
- [ ] Query con `ORDER BY a.scheduled_end_time ASC LIMIT ?`
- [ ] Log informativo quando `results.length === BATCH_SIZE`
- [ ] Filtro aste senza offerente invariato
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
