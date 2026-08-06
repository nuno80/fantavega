# 09 — Parallelizzazione post-commit

**What to build:** Dopo `await tx.commit()`, le query indipendenti per il payload Socket.IO (budget finalBidder + budget previous bidder) vengono eseguite in `Promise.all()`. Nessuna query parallela dentro la transazione Turso. Payload Socket.IO prodotto identico a prima.

**Blocked by:** 06 — Estrazione `bid-expiry.ts`, 08 — Validazione timer di risposta

**Status:** done

- [x] `Promise.all()` per query budget post-commit
- [x] Nessuna query parallela dentro transazione
- [x] Payload Socket.IO identico (utenti, budget, locked_credits)
- [x] `pnpm run type-check` passa
- [x] `pnpm run test:run` passa
