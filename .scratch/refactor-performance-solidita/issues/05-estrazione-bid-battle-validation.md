# 05 — Estrazione `bid-battle.ts` + `bid-validation.ts`

**What to build:** Estrarre da `bid.service.ts` i tipi e le funzioni pure in due nuovi file. `bid-battle.ts` contiene `AutoBidBattleParticipant`, `BattleStep`, `BattleResult`, `simulateAutoBidBattle()` — senza import da `@/lib/db`, `socket-emitter` o servizi con side-effect. `bid-validation.ts` contiene `LeagueForBidding`, `PlayerForBidding`, `ParticipantForBidding`, `checkSlotsAndBudgetOrThrow()`. Re-export obbligatori dal barrel `bid.service.ts`. Import esterni invariati.

**Blocked by:** 02 — Test di caratterizzazione auto-bid, 04 — Servizio centralizzato `locked_credits`

**Status:** ready-for-agent

- [ ] `src/lib/db/services/bid-battle.ts` creato, senza import DB/side-effect
- [ ] `src/lib/db/services/bid-validation.ts` creato
- [ ] Re-export in `bid.service.ts` per tutti i simboli pubblici
- [ ] `rg -n "from ['\"].*bid\.service" src socket-server.ts` non mostra import rotti
- [ ] Test auto-bid ancora verdi
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
