# Piano d'azione — Refactoring post-analisi `docs/`

Analisi di riferimento: `docs/bid.service.ts`, `docs/scheduler.ts`, `docs/AuctionPageContent.tsx` (snapshot identici ai file in `src/`).

Priorità: **P0** = correttezza, **P1** = igiene/codice, **P2** = comfort/refactoring.

---

## STEP 1 — [P0] Deduplicare il ricalcolo locked_credits in `bid.service.ts` ✅ DONE

**Stato:** applicato. `ACTIVE_EXPOSURE_SQL` è ora `export` in `locked-credits.service.ts`; nuova funzione `recalcUserLockedCredits(leagueId, userId, executor?)` (idempotente, accetta tx). Le 2 copie di ricalcolo in `placeBidOnExistingAuction` sostituite con la chiamata unificata; commenti mojibake nel blocco ricalcolo corretti. Test dedicato: `src/lib/db/services/__tests__/locked-credits-recalc.test.ts` (3 casi). Suite completa verde (255 test).

**Rimandato a STEP 3/7:** la variante "check budget auto-bid" (riga ~1030) ricalcola la riserva slot col pattern di `checkSlotsAndBudgetOrThrow` ma senza escludere l'asta corrente — unificazione logica di riserva quando si estrae l'upsert auto-bid.

---

## STEP 2 — [P1] Fix encoding (mojibake) nei file di servizio ✅ DONE

**Stato:** applicato. Unico file colpito in `src/`: `bid.service.ts` (26 occorrenze). Riparati tutti i mojibake UTF-8 (`Ã¨`→è, `Ã²`→ò, `Ã¹`→ù, `Ã€`→À, `Ã©`→é, `Ã `→à, etc.), rimossi anche commenti e il BOM di testa. `grep 'Ã'` → 0. Suite completa verde (255 test).

---

## STEP 3 — [P1] Ridurre `placeBidOnExistingAuction` da monolite

**Problema:** ~600 righe cresciute a strati (prova: i commenti "v3.1", "v3.2", "CORREZIONE", "FIX"). I blocchi accoppiati nella transazione sono: validazione, auto-bid upsert, simulazione battaglia, ricalcolo crediti, timer/stati, outbox. Il loop di ricalcolo per-utente fa N query per N utenti superati.

**Azione (in ordine, ciascuna verificabile separatamente):**
1. Estrarre il blocco "auto-bid upsert + lock crediti" (righe ~740-830) in una funzione `upsertAutoBidAndLockCredits(tx, ...)`.
2. Estrarre il blocco "ricalcolo locked_credits per set di utenti" (righe ~1140-1240, già dedup in STEP 1) in `recalcLockedCreditsForUsers(tx, leagueId, userIds)`.
3. Estrarre il blocco "timer/estati post-bid" (righe ~1240-1260: `cancelResponseTimer`, `setUserAuctionStateInTx`, `createResponseTimer`) in una funzione `applyResponseTimerEffects(tx, auction, userId, previousHighestBidderId, finalBidderId)`.
4. La transazione principale resta un orcherstratore che chiama le sotto-funzioni — non si tocca l'ordine delle operazioni.

**Verifica:** identica a STEP 1 (tsc + test + scenario manuale con auto-bid e rilanci). Ogni estrazione = 1 commit separato per isolare regressioni.

**Rischio:** MEDIO (è il percorso più caldo del sistema). Le estrazioni devono essere **puramente meccaniche** (cut-paste con stessi argomenti), mai "miglioramenti" mentre si sposta codice.

---

## STEP 4 — [P1] Pulizia commenti ambigui e stato morto

**Azione:**
1. `getAuctionStatusForPlayer` in `bid.service.ts`: rimuovere il commento "ENHANCED: use database transaction... We'll stick to execute for now" — è un residuo di indecisione. La scelta è già fatta (execute semplice per letture): documentarla in una riga o niente.
2. `AuctionPageContent.tsx`: lo stato `currentUserBudget` è scritto in 5 punti ma mai letto (`const [, setCurrentUserBudget]`). Verificare che nessun figlio lo consumi via prop/context; se confermato, eliminare lo stato e i 5 setter.
3. `simulateAutoBidBattle`: non mutare gli input (`autoBids.forEach((ab) => (ab.isActive = true))` muta l'array passato; `.sort()` in-place sugli array interni). Clonare prima di manipolare.

**Verifica:** tsc pulito; `grep -rn "setCurrentUserBudget" src/` → solo la dichiarazione rimossa (0 risultati). Nessun cambio di comportamento UI (verifica visiva su `/auctions`).

**Rischio:** BASSO per 1 e 2 (codice morto/commenti). MEDIO per 3 (logica della battaglia — coprire con test dedicato, vedi STEP 6).

---

## STEP 5 — [P1] Valutare `useInactivityRedirect({ timeoutSeconds: 30 })`

**Problema:** redirect a home dopo 30s di inattività su una pagina d'asta realtime. Un utente che guarda la battaglia senza cliccare viene buttato fuori.

**Azione (decisione, non solo codice):**
1. Leggere `src/hooks/useInactivityRedirect.ts`: verificare se il timer si resetta su eventi socket (bid ricevuti) o solo su input utente (mousemove/keydown/click).
2. Se si resetta solo su input: è un bug UX. Aumentare il timeout (es. 5 min) **e/o** resettare il timer su qualsiasi evento `auction-update`/`auction-created`/`auction-closed` ricevuto dal socket.
3. Documentare la scelta nel file hook con un commento.

**Verifica:** con due tab aperte, offrire da un tab e verificare che l'altro tab (inattivo) non venga rediretto entro 30s.

**Rischio:** BASSO. Se la decisione è "lasciare 30s come requisito prodotto" (es. stanze condivise su schermi pubblici), documentare e chiudere senza codice.

---

## STEP 6 — [P0] Test di regressione per la logica auto-bid

**Problema:** la battaglia auto-bid (`simulateAutoBidBattle`) e i ricalcoli crediti non hanno test dedicati, ma sono il percorso a rischio più alto (money path).

**Azione:**
1. Estrarre (se serve) la pura logica di battaglia in un modulo importabile senza DB — `simulateAutoBidBattle` è già pura; verificare che sia importabile senza side-effect.
2. Aggiungere test unitari coprendo:
   - Nessun auto-bid competitore → vince manuale.
   - Parità max_amount → vince il più vecchio per createdAt, paga il max.
   - Secondo migliore → vincitore paga `min(secondBest+1, max)`.
   - Auto-bid singolo → paga `min(manual+1, max)`.
3. Aggiungere test per `recalcUserLockedCredits` (STEP 1) con un mock di `tx.execute`.

**Verifica:** `npx vitest run` passa. I casi sopra sono coperti da almeno un test ciascuno.

**Rischio:** BASSO (logica pura, già testabile). Usare il framework esistente (`vitest`, già configurato — vedi `vitest.config.ts` e test esistenti in `tests/`).

---

## STEP 7 — [P2] Minori / accumulo (solo se il resto è chiuso)

1. Cooldown check (`getUserCooldownInfo`) avviene fuori transazione in entrambi i place-bid: TOCTOU lieve, accettabile (un rilancio durante il cooldown è a basso impatto). Documentare con commento `ponytail:` se si decide di lasciarlo.
2. Verificare se `checkAndRecordCompliance` fire-and-forget nel settlement (`processAuctionWinner`) è coerente con la gestione best-effort altrove — uniformare se divergente.
3. Considerare batching delle N query di ricalcolo crediti per-utente in una singola query con `IN` (solo se il numero di utenti per lega lo giustifica — misurare prima).

---

## Ordine consigliato di esecuzione

```
STEP 1 (dedup) → STEP 6 (test auto-bid) → STEP 3 (estrazione) → STEP 2 (encoding)
→ STEP 4 (pulizia) → STEP 5 (inactivity redirect) → STEP 7 (accumulo)
```

Motivo: STEP 1 prima di STEP 3 evita di estrarre codice duplicato due volte; STEP 6 prima di STEP 3 dà la rete di sicurezza per il refactoring più rischioso; STEP 2 e 4 sono quick win indipendenti; STEP 5 è una decisione di prodotto, non solo codice.

## Definition of Done

- [ ] `npx tsc --noEmit` pulito
- [ ] `npx vitest run` verde (incluse le nuove prove di STEP 6)
- [ ] `grep -rn 'Ã' src/ --include='*.ts' --include='*.tsx'` → 0 risultati
- [ ] Scenario manuale: rilancio con auto-bid, superamento, settlement → locked_credits e budget identici a prima del refactor
- [ ] Nessun nuovo TOCTOU introdotto rispetto allo stato attuale
