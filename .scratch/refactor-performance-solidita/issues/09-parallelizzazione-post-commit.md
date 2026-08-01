# 09 — Parallelizzazione post-commit

**What to build:** Dopo `await tx.commit()`, le query indipendenti per il payload Socket.IO (budget finalBidder + budget previous bidder) vengono eseguite in `Promise.all()`. Nessuna query parallela dentro la transazione Turso. Payload Socket.IO prodotto identico a prima.

**Blocked by:** 06 — Estrazione `bid-expiry.ts`, 08 — Validazione timer di risposta

**Status:** ready-for-agent

- [ ] `Promise.all()` per query budget post-commit
- [ ] Nessuna query parallela dentro transazione
- [ ] Payload Socket.IO identico (utenti, budget, locked_credits)
- [ ] `pnpm run type-check` passa
- [ ] `pnpm run test:run` passa
