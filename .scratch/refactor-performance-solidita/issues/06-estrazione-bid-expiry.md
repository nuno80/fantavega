# 06 — Estrazione `bid-expiry.ts`

**What to build:** Estrarre da `bid.service.ts`: `ExpiredAuctionData`, `processAuctionWinner()`, `processExpiredAuctionsAndAssignPlayers()`, `closeAllActiveAuctionsForLeague()` in `bid-expiry.ts`. Import diretti (no barrel) per evitare cicli. Re-export dal barrel `bid.service.ts`. Import esterni invariati.

**Blocked by:** 04 — Servizio centralizzato `locked_credits`, 05 — Estrazione `bid-battle.ts` + `bid-validation.ts`

**Status:** ready-for-agent

- [ ] `src/lib/db/services/bid-expiry.ts` creato
- [ ] Import interni diretti, nessun ciclo
- [ ] Re-export in `bid.service.ts` per tutti i simboli pubblici
- [ ] `rg -n "from ['\"].*bid\.service" src socket-server.ts` non mostra import rotti
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
