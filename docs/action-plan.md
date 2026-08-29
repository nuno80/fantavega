# Piano d'azione — Refactoring post-analisi `docs/`

Analisi di riferimento: `docs/bid.service.ts`, `docs/scheduler.ts`, `docs/AuctionPageContent.tsx` (snapshot identici ai file in `src/`).

Priorità: **P0** = correttezza, **P1** = igiene/codice, **P2** = comfort/refactoring.

---

## STEP 1 — [P0] Deduplicare il ricalcolo locked_credits in `bid.service.ts` ✅ DONE

**Stato:** applicato. `ACTIVE_EXPOSURE_SQL` è ora `export` in `locked-credits.service.ts`; nuova funzione `recalcUserLockedCredits(leagueId, userId, executor?)` (idempotente, accetta tx). Le 2 copie di ricalcolo in `placeBidOnExistingAuction` sostituite con la chiamata unificata; commenti mojibake nel blocco ricalcolo corretti. Test dedicato: `src/lib/db/services/__tests__/locked-credits-recalc.test.ts` (3 casi). Suite completa verde (255 test).

**Rimandato a STEP 3/7:** la variante "check budget auto-bid" (riga ~1030) ricalcola la riserva slot col pattern di `checkSlotsAndBudgetOrThrow` ma senza escludere l'asta corrente — unificazione logica di riserva quando si estrae l'upsert auto-bid.

---

## STEP 2 — [P1] Fix encoding (mojibake) nei file di servizio ✅ DONE

**Stato:** applicato. Unico file colpito in `src/`: `bid.service.ts` (26 occorrenze). Riparati tutti i mojibake UTF-8 (`Ã¨`→è, `Ã²`→ò, `Ã¹`→ù, `Ã€`→À, `Ã©`→é, `Ã`→à, etc.), rimossi anche commenti e il BOM di testa. `grep 'Ã'` → 0. Suite completa verde (255 test).

---

## STEP 3 — [P1] Ridurre `placeBidOnExistingAuction` da monolite ✅ DONE

**Stato:** applicato. Estratte tre sotto-funzioni puramente meccaniche (1 commit): `upsertAutoBidAndLockCredits(tx, auction, userId, autoBidMaxAmount, leagueId, league, now)`, `recalcLockedCreditsForUsers(tx, leagueId, userIds)` e `applyResponseTimerEffects(tx, auctionId, bidderUserId, previousHighestBidderId, finalBidderId)`. La transazione principale è ora un orchestratore; ordine operazioni invariato. Nota: il check budget auto-bid (riga ~1030) resta duplicato col pattern riserva slot — rimandato a quando si estrae l'upsert auto-bid (vedi STEP 3/7).

---

## STEP 4 — [P1] Pulizia commenti ambigui e stato morto ✅ DONE

**Stato:** applicato (con STEP 6). Rimosso il commento "ENHANCED" in `getAuctionStatusForPlayer` (documentata la scelta execute semplice in una riga); eliminato lo stato morto `currentUserBudget` (5 setter, mai letto; il budget vive già nel managers array); `simulateAutoBidBattle` non muta più gli input (copie prima di sort/filter) — coperto dal test di immutabilità in `auto-bid-battle.test.ts`.

---

## STEP 5 — [P1] Valutare `useInactivityRedirect({ timeoutSeconds: 30 })` ✅ DONE

**Stato:** decisione presa: bug UX confermato (il timer si resettava solo su input utente). Corretto: il hook espone `resetTimer`; `AuctionPageContent` lo chiama su `auction-update`/`auction-created`/`auction-closed` ricevuti dal socket — un utente che guarda la battaglia senza cliccare non viene rediretto. Scelta documentata nel hook (commento STEP-5). Timeout 30s invariato (requisito sessioni chiuse su schermi pubblici).

---

## STEP 6 — [P0] Test di regressione per la logica auto-bid ✅ DONE

**Stato:** applicato. `simulateAutoBidBattle` estratta in modulo puro senza DB (`src/lib/db/services/auto-bid-battle.ts`), importabile senza side-effect; test dedicati in `auto-bid-battle.test.ts` (7 casi: nessun competitore, parità max→vince il più vecchio paga max, secondo migliore→min(secondBest+1,max), cap al proprio max, auto-bid singolo→min(manuale+1,max), parità esatta manuale/auto, immutabilità input). `recalcUserLockedCredits` già coperto da `locked-credits-recalc.test.ts` (STEP 1).

---

## STEP 7 — [P2] Minori / accumulo ✅ (parziale: 1-2 fatti, 3 rimandato)

1. ✅ Cooldown check fuori transazione: documentato con commento `ponytail:` (TOCTOU lieve accettato) in entrambi i place-bid.
2. ✅ Compliance check nel settlement: commento allineato (fire-and-forget best-effort, coerente col path bid).
3. ⏸ Batching delle N query di ricalcolo crediti: rimandato (serve misura della dimensione lega; il loop per-utente è già dedup via `recalcUserLockedCredits`).

---

## Ordine consigliato di esecuzione

```
STEP 1 (dedup) → STEP 6 (test auto-bid) → STEP 3 (estrazione) → STEP 2 (encoding)
→ STEP 4 (pulizia) → STEP 5 (inactivity redirect) → STEP 7 (accumulo)
```

Motivo: STEP 1 prima di STEP 3 evita di estrarre codice duplicato due volte; STEP 6 prima di STEP 3 dà la rete di sicurezza per il refactoring più rischioso; STEP 2 e 4 sono quick win indipendenti; STEP 5 è una decisione di prodotto, non solo codice.

## Definition of Done

- [x] `npx tsc --noEmit` pulito (src/ — i file snapshot non tracciati in docs/ non compilano, fuori scope)
- [x] `npx vitest run` verde (262 test, incluse le nuove prove di STEP 6)
- [x] `grep -rn 'Ã' src/ --include='*.ts' --include='*.tsx'` → 0 risultati
- [ ] Scenario manuale: rilancio con auto-bid, superamento, settlement → locked_credits e budget identici a prima del refactor
- [x] Nessun nuovo TOCTOU introdotto rispetto allo stato attuale (cooldown: pre-esistente, documentato STEP-7.1)
