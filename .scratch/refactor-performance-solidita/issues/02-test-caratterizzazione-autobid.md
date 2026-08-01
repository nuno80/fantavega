# 02 — Test di caratterizzazione auto-bid

**What to build:** Suite Vitest che blocca il comportamento attuale di `simulateAutoBidBattle()` prima di qualsiasi refactor. Copre: nessun auto-bid, uno, due con massimali diversi, stesso massimale, stesso massimale con timestamp diversi, auto-bid dell'offerente iniziale, array vuoto, non-mutazione dell'input. Se l'implementazione muta l'input, il test lo documenta.

**Blocked by:** 01 — Baseline checkout & documentazione

**Status:** ready-for-agent

- [ ] File test creato in `src/lib/db/services/__tests__/`
- [ ] Caso: nessun auto-bid
- [ ] Caso: un auto-bid
- [ ] Caso: due auto-bid con massimali diversi
- [ ] Caso: due auto-bid con stesso massimale
- [ ] Caso: stesso massimale con timestamp diversi
- [ ] Caso: auto-bid dell'offerente iniziale
- [ ] Caso: array vuoto
- [ ] Caso: input non mutato
- [ ] Nessuna modifica all'algoritmo esistente
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
