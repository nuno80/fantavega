# 12 — Parallelizzazione scheduler

**What to build:** Lo scheduler esegue i 4 task (`reapGhostSessions`, `processExpiredAuctionsAndAssignPlayers`, `processExpiredResponseTimers`, `processExpiredComplianceTimers`) in `Promise.allSettled()`. Blocco anti-overlap, `startScheduler()` idempotente, `stopScheduler()` funzionante, log durata e fallimenti, `runManualProcessing()` per test. Import da `bid-expiry.ts`.

**Blocked by:** 07 — Batch aste scadute, 11 — Retry controllato

**Status:** ready-for-agent

- [ ] `Promise.allSettled()` per i 4 task
- [ ] Blocco contro esecuzioni sovrapposte
- [ ] `startScheduler()` idempotente
- [ ] `stopScheduler()` funzionante
- [ ] Log durata e fallimenti per ogni task
- [ ] `runManualProcessing()` esposto per test
- [ ] Import da `bid-expiry.ts`
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
