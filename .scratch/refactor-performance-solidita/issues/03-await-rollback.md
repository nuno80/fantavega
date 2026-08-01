# 03 — Await rollback transazionali

**What to build:** Ogni chiamata `.rollback()` nei service deve essere preceduta da `await`. Verificare in `response-timer.service.ts`, `bid.service.ts`, `auction-states.service.ts`, `auction-league.service.ts`, `penalty.service.ts` e qualsiasi altro file sotto `src/lib/db/services`. Controllare anche alias di variabili e chiamate multilinea.

**Blocked by:** 01 — Baseline checkout & documentazione

**Status:** ready-for-agent

- [ ] Tutte le chiamate `.rollback()` nei service sono awaited
- [ ] Verifica include alias di variabili e chiamate multilinea
- [ ] `rg -n "\.rollback\(\)" src/lib/db/services` mostra solo chiamate awaited
- [ ] `pnpm run type-check` passa
