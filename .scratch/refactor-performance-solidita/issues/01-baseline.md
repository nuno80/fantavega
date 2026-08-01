# 01 — Baseline checkout & documentazione

**What to build:** Creare il branch `refactor/performance-solidita` da `main` aggiornato, eseguire type-check, test e build, raccogliere dimensioni di `bid.service.ts` e conteggio occorrenze grep. Salvare tutto in `docs/PR/refactor-baseline.md`. Se la baseline fallisce, documentare gli errori senza correggerli.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Branch `refactor/performance-solidita` creato da `main` aggiornato
- [x] `pnpm install --frozen-lockfile` eseguito con successo
- [x] `pnpm run type-check` eseguito, esito documentato
- [x] `pnpm run test:run` eseguito, esito documentato
- [x] `pnpm run build` eseguito, esito documentato
- [x] `wc -l` e `wc -c` di `bid.service.ts` documentati
- [x] Grep per `total_locked`, `rollback()`, `as unknown as`, `processUserResponse`, `abandonAuction`, `simulateAutoBidBattle`, `notifySocketServer`, `handleBidderChange` eseguiti e conteggi registrati
- [x] `docs/PR/refactor-baseline.md` creato con commit, dimensioni, esiti e conteggi
- [x] Errori preesistenti distinti da errori introdotti (se presenti)
