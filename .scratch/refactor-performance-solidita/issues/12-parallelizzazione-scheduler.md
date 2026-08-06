# 12 — Parallelizzazione scheduler

**What to build:** Lo scheduler esegue i 4 task (`reapGhostSessions`, `processExpiredAuctionsAndAssignPlayers`, `processExpiredResponseTimers`, `processExpiredComplianceTimers`) in `Promise.allSettled()`. Blocco anti-overlap, `startScheduler()` idempotente, `stopScheduler()` funzionante, log durata e fallimenti, `runManualProcessing()` per test. Import da `bid-expiry.ts`.

**Blocked by:** 07 — Batch aste scadute, 11 — Retry controllato

**Status:** done

- [x] `Promise.allSettled()` per i 4 task
- [x] Blocco contro esecuzioni sovrapposte
- [x] `startScheduler()` idempotente
- [x] `stopScheduler()` funzionante
- [x] Log durata e fallimenti per ogni task
- [x] `runManualProcessing()` esposto per test
- [x] Import da `bid-expiry.ts`
- [x] `pnpm run type-check` passa
- [x] `pnpm run test:run` passa
