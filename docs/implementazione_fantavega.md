Il repository usa:

- Next.js 15.5.9;
- React 19;
- TypeScript strict;
- `@libsql/client` e transazioni Turso;
- Socket.IO;
- Clerk;
- pnpm 10.14.0;
- Vitest.

Il `tsconfig.json` usa alias `@/* -> ./src/*`, `strict: true`, `noEmit: true` e `moduleResolution: bundler`.

---

## 3. Regole non negoziabili per l'AI

- Creare il branch solo da `main` aggiornato.
- Non modificare la logica di auth o sicurezza.
- Non modificare lo schema DB.
- Non aggiungere dipendenze npm.
- Non modificare `src/components/`, `src/app/`, `src/contexts/` o `src/hooks/`, salvo testualmente richiesto da una verifica di integrazione giÃ  esistente.
- Non rimuovere `console.log` esistenti.
- Mantenere tutti gli export pubblici attuali tramite re-export dal file originale.
- Usare ES modules.
- Dopo ogni fase eseguire almeno `pnpm run type-check`.
- Non fare refactoring massivo e correzione funzionale nello stesso commit se possono essere separati.
- Prima di ogni retry, verificare che ripetere l'operazione non duplichi ledger, penalitÃ , assegnazioni o notifiche.

---

## 4. Fase 0: checkout e baseline

Eseguire:

```bash
git fetch origin main
git checkout main
git reset --hard origin/main
git checkout -b refactor/performance-solidita
pnpm install --frozen-lockfile

printf '\n== VERSIONE ==\n'
git rev-parse HEAD
git log -1 --oneline

printf '\n== DIMENSIONI ==\n'
wc -l src/lib/db/services/bid.service.ts
wc -c src/lib/db/services/bid.service.ts

printf '\n== BASELINE TYPECHECK ==\n'
pnpm run type-check

printf '\n== BASELINE TEST ==\n'
pnpm run test:run

printf '\n== BASELINE BUILD ==\n'
pnpm run build

printf '\n== RICERCHE ==\n'
rg -n "total_locked|rollback\\(\\)|as unknown as|processUserResponse|abandonAuction|simulateAutoBidBattle|notifySocketServer|handleBidderChange" src/lib/db/services socket-server.ts src/app || true
```

Salvare in `docs/PR/refactor-baseline.md`:

- commit usato;
- numero di righe e byte di `bid.service.ts`;
- esito e output sintetico di type-check, test e build;
- conteggio delle occorrenze trovate dalle ricerche.

Se la baseline fallisce, non correggere automaticamente gli errori: documentarli e distinguere gli errori preesistenti da quelli introdotti.

---

## 5. Fase 1: test di caratterizzazione dell'auto-bid

Prima di spostare la funzione, creare test Vitest per:

- nessun auto-bid;
- un auto-bid;
- due auto-bid con massimali diversi;
- due auto-bid con stesso massimale;
- stesso massimale con timestamp diversi;
- auto-bid dell'offerente iniziale;
- array vuoto;
- verifica che l'input non venga mutato, se il comportamento atteso lo richiede.

Non cambiare l'algoritmo in questa fase. Se l'implementazione modifica `isActive` degli oggetti ricevuti, registrare il comportamento e correggerlo solo con un test che dimostri che la correzione non altera il risultato.

---

## 6. Fase 2: servizio centralizzato `locked_credits`

Creare:

```text
src/lib/db/services/locked-credits.service.ts
```

Esporre:

```ts
export const recalculateLockedCreditsForUser = async (...) => ...;
export const recalculateLockedCreditsForUsers = async (...) => ...;
```

Usare un tipo compatibile sia con `db` sia con una transazione:

```ts
type ExecuteClient = Pick<typeof db, "execute">;
```

La query SQL per il calcolo deve esistere una sola volta nel codebase. Il servizio deve:

1. calcolare auto-bid attivi su aste `active` o `closing`;
2. calcolare offerte manuali vincenti senza auto-bid;
3. aggiornare `league_participants.locked_credits` nella stessa transazione passata dal chiamante;
4. restituire il valore numerico aggiornato;
5. deduplicare gli utenti nella versione batch.

Cercare tutte le copie prima di sostituirle:

```bash
rg -n "total_locked|SUM\\(ab\\.max_amount\\)|locked_credits.*UPDATE" src/lib/db/services
```

Sostituire almeno le occorrenze in:

- `bid.service.ts`;
- `response-timer.service.ts`;
- il nuovo `bid-expiry.ts`, se la funzione viene spostata prima della sostituzione.

Accettazione:

```bash
rg -n "total_locked" src/lib/db/services
```

Deve trovare solo `locked-credits.service.ts`, salvo commenti esplicativi autorizzati.

---

## 7. Fase 3: rollback transazionale

Cercare:

```bash
rg -n "\\.rollback\\(\\)" src/lib/db/services
```

Ogni chiamata reale deve essere attesa:

```ts
await transaction.rollback();
await tx.rollback();
```

Controllare in particolare:

- `response-timer.service.ts`;
- `bid.service.ts`;
- `auction-states.service.ts`;
- `auction-league.service.ts`;
- `penalty.service.ts`.

Non usare solo `grep -v await` come verifica finale: controllare anche chiamate multilinea e alias di variabili.

---

## 8. Fase 4: estrazione di `bid.service.ts`

Creare:

```text
src/lib/db/services/bid-battle.ts
src/lib/db/services/bid-validation.ts
src/lib/db/services/bid-expiry.ts
```

### `bid-battle.ts`

Spostare senza cambiare algoritmo:

- `AutoBidBattleParticipant`;
- `BattleStep`;
- `BattleResult`;
- `simulateAutoBidBattle()`.

Questo file non deve importare `@/lib/db`, `socket-emitter` o servizi con effetti collaterali.

### `bid-validation.ts`

Spostare:

- `LeagueForBidding`;
- `PlayerForBidding`;
- `ParticipantForBidding`;
- `checkSlotsAndBudgetOrThrow()`.

Il client passato alla funzione deve continuare a supportare sia `db` sia una transazione.

### `bid-expiry.ts`

Spostare:

- `ExpiredAuctionData`;
- `processAuctionWinner()`;
- `processExpiredAuctionsAndAssignPlayers()`;
- `closeAllActiveAuctionsForLeague()`.

Mantenere gli import corretti e non importare il barrel da dentro i moduli estratti: usare import diretti per evitare cicli.

### Re-export obbligatori dal barrel

In `bid.service.ts` mantenere:

```ts
export { simulateAutoBidBattle } from "./bid-battle";
export type { AutoBidBattleParticipant, BattleStep, BattleResult } from "./bid-battle";
export { checkSlotsAndBudgetOrThrow } from "./bid-validation";
export type { LeagueForBidding, PlayerForBidding, ParticipantForBidding } from "./bid-validation";
export {
  processExpiredAuctionsAndAssignPlayers,
  closeAllActiveAuctionsForLeague,
} from "./bid-expiry";
```

Verificare prima e dopo gli import esterni:

```bash
rg -n "from ['\"].*bid\\.service" src socket-server.ts
```

Il limite di 600 righe Ã¨ un obiettivo, non una prova di correttezza. La prova Ã¨ che le responsabilitÃ  siano separate, gli export restino compatibili e i test passino.

---

## 9. Fase 5: batch delle aste scadute

In `processExpiredAuctionsAndAssignPlayers()` usare:

```ts
const BATCH_SIZE = 50;
```

La query deve contenere:

```sql
ORDER BY a.scheduled_end_time ASC
LIMIT ?
```

con argomenti:

```ts
args: [now, BATCH_SIZE]
```

Se il numero di risultati Ã¨ `BATCH_SIZE`, scrivere un log informativo. Non cambiare il filtro sulle aste senza offerente senza una decisione di business esplicita.

---

## 10. Fase 6: timer di risposta

Prima cercare il flusso reale:

```bash
rg -n "processUserResponse|abandonAuction|activeTimers|auction_id|response_deadline" src/lib/db/services src/app
```

Il piano iniziale cita `processUserResponse()`, ma la versione verificata contiene `abandonAuction()` e non autorizza a inventare una funzione o una query in un punto non esistente.

Applicare la validazione dell'asta solo al chiamante reale. Il controllo deve:

1. recuperare l'asta target da lega e giocatore;
2. verificare lo stato ammesso, includendo `closing` solo se previsto dal flusso;
3. confrontare `timer.auction_id` con l'ID dell'asta target;
4. fare controllo e transizione nello stesso contesto transazionale quando possibile.

Il commit pubblico piÃ¹ recente contiene giÃ  hardening per race condition su sessioni e timer. Prima di modificarlo, verificare se sono giÃ  presenti:

- aggiornamenti condizionati da `status`;
- controllo di `rowsAffected`;
- parametro `notAfter` per il logout;
- claim atomici per attivazione, scadenza e abbandono.

Non regredire questi fix.

---

## 11. Fase 7: parallelizzazione post-commit

Dopo `await tx.commit()`, parallelizzare solo query indipendenti per il payload Socket.IO.

Usare `Promise.all()` per `getParticipantBudget(finalBidderId)` e l'eventuale precedente offerente. Non eseguire query parallele sulla stessa transazione Turso.

Verificare che il payload prodotto sia identico a quello precedente, inclusi utenti, budget e `locked_credits`.

---

## 12. Fase 8: mapper DB tipizzati

Creare:

```text
src/lib/db/services/db-mappers.ts
```

Creare almeno tre mapper:

- auction combinata;
- participant;
- league.

I mapper devono validare runtime il tipo del campo. Non usare una funzione generica che restituisce semplicemente `value as T`, perchÃ© quello Ã¨ ancora un cast non verificato.

Esempio:

```ts
function requiredNumber(row: Row, field: string): number {
  const value = row[field];
  if (typeof value !== "number") {
    throw new Error(`[DB_MAPPER] Campo numerico non valido: ${field}`);
  }
  return value;
}
```

Sostituire prima i cast `as unknown as` dentro transazioni e flussi finanziari di `bid.service.ts`. Non tentare di eliminare tutti i cast del repository in questa attivitÃ .

---

## 13. Fase 9: retry controllato

Creare:

```text
src/lib/db/services/retry-utils.ts
```

`withRetry()` deve usare backoff esponenziale, limite massimo e log finale.

Applicarlo inizialmente solo a:

- compliance check idempotenti;
- operazioni dichiaratamente idempotenti giÃ  protette da `UPDATE ... WHERE` o chiave univoca.

Non applicarlo automaticamente a:

- INSERT di ledger;
- assegnazione giocatori;
- penalitÃ  senza chiave di idempotenza;
- notifiche che possono causare effetti applicativi duplicati.

Per ogni uso fire-and-forget usare `void` e rendere visibile il fallimento:

```ts
void withRetry(fn, options);
```

---

## 14. Fase 10: scheduler

Lo scheduler puÃ² usare `Promise.allSettled()` per eseguire in parallelo:

- `reapGhostSessions()`;
- `processExpiredAuctionsAndAssignPlayers()`;
- `processExpiredResponseTimers()`;
- `processExpiredComplianceTimers()`.

Mantenere:

- blocco contro esecuzioni sovrapposte;
- `startScheduler()` idempotente;
- `stopScheduler()` funzionante;
- log di durata e fallimenti;
- `runManualProcessing()` per i test.

Se l'import di aste scadute cambia, usare il nuovo `bid-expiry.ts` dopo che l'estrazione Ã¨ completata.

---

## 15. Fase 11: Socket.IO

### Deduplicazione

Non modificare il blocco `io.use()`.

L'hash MD5 Ã¨ ammesso solo per ridurre la dimensione della chiave cache. Non considerarlo una soluzione completa: `JSON.stringify()` resta costoso e l'ordine delle proprietÃ  puÃ² cambiare.

Mantenere una cache limitata e una pulizia deterministica. Se possibile, preferire una chiave business o un `eventId` stabile.

### Disconnect

Usare una Map di timer per utente e cancellarla quando l'utente rientra nella room. Il callback deve:

- controllare se esistono socket dello stesso utente;
- chiamare `recordUserLogout` in `try/catch`;
- cancellare la Map;
- non chiudere una sessione protetta da heartbeat piÃ¹ recente.

Il timer in memoria non sopravvive a un restart Railway. La protezione definitiva resta il servizio di reap delle sessioni.

Non modificare:

```text
src/middleware.ts
src/lib/auth/league-guard.ts
sezione io.use() di socket-server.ts
```

---

## 16. Commit consigliati

Creare commit piccoli e reversibili:

```text
chore: record refactor baseline
 test: characterize auto bid battle
fix: await transaction rollbacks
refactor: centralize locked credits recalculation
refactor: split bid battle and validation services
refactor: extract bid expiry service
fix: process expired auctions in bounded batches
fix: validate response timer auction identity
perf: parallelize post-commit budget reads
refactor: add runtime database row mappers
fix: add idempotent retry for compliance checks
perf: parallelize scheduler tasks
fix: harden socket disconnect timers
perf: bound socket emission deduplication cache
```

Se un commit contiene piÃ¹ di una responsabilitÃ , separarlo prima della revisione.

---

## 17. Verifica dopo ogni fase

Dopo ogni commit:

```bash
pnpm run type-check
```

Dopo le fasi che toccano servizi:

```bash
pnpm run test:run
```

Prima del merge:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run type-check
pnpm run test:run
pnpm run test:e2e
pnpm run build

rg -n "total_locked" src/lib/db/services
rg -n "\\.rollback\\(\\)" src/lib/db/services
rg -n "as unknown as" src/lib/db/services/bid.service.ts
wc -l src/lib/db/services/bid.service.ts
```

---

## 18. Smoke test manuale obbligatorio

Verificare:

1. creazione asta;
2. offerta manuale;
3. rilancio su asta esistente;
4. auto-bid con massimali diversi;
5. paritÃ  tra auto-bid;
6. asta scaduta con vincitore;
7. timer scaduto;
8. abbandono asta;
9. due scheduler contemporanei;
10. due richieste contemporanee di attivazione timer;
11. disconnect e reconnect entro 10 secondi;
12. heartbeat HTTP mentre Socket.IO Ã¨ disconnesso;
13. riavvio del socket server con sessione potenzialmente fantasma.

Controllare direttamente che non esistano duplicati di:

- assegnazioni giocatore;
- cooldown;
- ledger `timer_expired`;
- transizioni terminali del timer;
- notifiche critiche duplicate.

---

## 19. Criteri finali di accettazione

Il lavoro Ã¨ completo solo se:

- la baseline Ã¨ documentata;
- `bid.service.ts` Ã¨ misurato sul checkout reale;
- `bid-battle.ts` non importa il DB;
- gli export esistenti restano compatibili;
- la query `total_locked` Ã¨ centralizzata;
- ogni rollback Ã¨ awaited;
- le aste scadute sono processate in batch ordinato da 50;
- il flusso timer valida l'asta reale, non una semplice truthiness check;
- i retry sono limitati a operazioni idempotenti;
- lo scheduler non si sovrappone a sÃ© stesso;
- il logout ritardato non chiude una sessione protetta da heartbeat piÃ¹ recente;
- type-check, test, lint e build passano;
- lo smoke test manuale passa.

Non accettare il lavoro solo perchÃ© il file `bid.service.ts` Ã¨ sceso sotto un certo numero di righe. La correttezza transazionale e la compatibilitÃ  degli export vengono prima della metrica di dimensione.
