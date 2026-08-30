# Piano d'azione

Stato: riordinato e verificato contro il codice al 30/08/2026. I punti eliminati
dalla versione precedente (tsconfig exclude docs, verifica Turso) non erano più
necessari: `docs/` non contiene più file `.ts/.tsx` (la build non si rompe) e la
verifica Turso è un controllo di runtime, non una modifica da pianificare.

Priorità: l'outbox è il cuore — senza recupero dei claim scaduti un evento può
restare bloccato per sempre in produzione. Tutto il resto viene dopo.

---

## 1. Outbox: recupero claim scaduti (CRITICO)

File: `src/lib/db/services/event-outbox.service.ts`

Il claim attuale reclama solo eventi con `claimed_at IS NULL`. Se il processo
che ha claimato un evento muore prima del deliver (crash, deploy, timeout),
l'evento resta con `claimed_at` valorizzato e `owner_token` attivo **per sempre**:
nessun dispatcher lo reclamerà mai più.

Modifiche:
- Nel claim (`dispatchOutboxEvents`), aggiungere la condizione
  `OR claimed_at IS NOT NULL AND claimed_at < now - 60` alla WHERE, così un
  claim scaduto (>= 60s) può essere reclamato da un altro dispatcher.
- Limitare il recupero: reclamare al massimo un evento alla volta quando si
  recupera uno scaduto, per ridurre il rischio di doppia consegna durante
  un'elaborazione valida ma lenta (una consegna può richiedere > 60s su socket
  bloccati). La soglia di 60s è un compromesso: sopra c'è il rischio di doppia
  consegna (rarissima, idempotenza del consumer), sotto il rischio di eventi
  bloccati più a lungo.
- Non toccare update/delete: restano condizionati da `owner_token` (già così).

Complessità: **media** — logica SQL semplice, ma richiede test di concorrenza.
Dipendenze: nessuna. Test in `tests/db/` con SQLite in-memory.

Test da aggiungere:
- processo interrotto dopo il claim → un nuovo dispatcher recupera l'evento;
- recupero del claim scaduto (claimed_at < now - 60);
- due dispatcher concorrenti → nessuna doppia consegna;
- elaborazione valida → nessun recupero prematuro (< 60s).

---

## 2. Outbox: rimuovere il fire-and-forget dal bid.service (MEDIO)

File: `src/lib/db/services/bid.service.ts` (righe ~755 e ~1252)

Le due chiamate `void dispatchOutboxEvents().catch(...)` dopo il commit
scavalcano il tick del scheduler (15s) per rendere il realtime più reattivo.
Funzionano, ma sono fire-and-forget in un contesto serverless: l'invocazione
può essere troncata a metà (morte del worker dopo il commit), e il claim fatto
da un'istanza effimera può restare orfano — esattamente il caso che il punto 1
mitiga.

Strategia:
- Rimuovere le due chiamate `void dispatchOutboxEvents()`.
- Aggiornare la UI del mittente con i dati già confermati (la server action
  restituisce già il risultato: `auction_id`, dati offerta).
- Spostare la distribuzione realtime al processo persistente Northflank
  (socket-server.ts), dove vive già il scheduler.

Complessità: **bassa-media** — rimozione banale, ma il delivery realtime passa
da "immediato best-effort" a "tick del scheduler" (vedi punto 3).
Dipendenze: dal punto 3 (senza un tick outbox dedicato, il realtime torna a 15s).

---

## 3. Scheduler: tick outbox separato a 1s (MEDIO)

File: `src/lib/scheduler.ts`

Oggi `runBackgroundTasks()` esegue outbox + settlement + timer + compliance in
un unico ciclo ogni 15s. Il piano chiede un intervallo separato per l'outbox di
~1s, senza rieseguire ogni secondo anche le altre attività.

Modifiche:
- Estrarre `dispatchOutboxEvents()` dal ciclo `runBackgroundTasks()`.
- Creare un secondo `setInterval` dedicato (outbox-only) a ~1s.
- Il ciclo dei 15s resta per settlement/timer/compliance.
- Mantenere il lease: il ciclo outbox separato non deve interferire con il lease
  del ciclo principale (il lease è per il lavoro pesante; l'outbox è leggero e
  idempotente, fenced dall'owner_token — un'istanza in più non fa danni).

Complessità: **media** — due timer, gestione avvio/stop, verifica che il lease
non venga doppiamente gestito.
Dipendenze: dal punto 2 (senza il fire-and-forget, il realtime dipende da
questo tick).

---

## 4. Test realtime (BASSO-MEDIO)

File: `tests/socket/` + `tests/db/`

Coprire il contratto end-to-end del realtime:
- aggiornamento locale dopo il successo della server action (UI mittente);
- ricezione socket da un secondo client;
- fallback dopo evento socket perso (l'outbox riprova);
- nessun polling client;
- nessun evento outbox bloccato.

Nota: esistono già `tests/socket/integration.socket.test.ts` e
`tests/socket/dedup.unit.test.ts` — il lavoro è estendere, non creare da zero.

Complessità: **media** — richiede un harness socket; i test esistenti danno la
base.
Dipendenze: dai punti 1–3 (testano il comportamento finale).

---

## 5. Lint e CI (BASSO)

File:
- `src/app/api/leagues/[league-id]/check-compliance/route.ts` — rimuovere
  l'import inutilizzato di `db` (riga 8).
- `src/app/auctions/AuctionPageContent.tsx` — `userId` è nelle dipendenze di
  `fetchManagersData`; valutare se serve. (Il piano originario suggeriva di
  rimuoverlo; verificare che il comportamento non cambi.)
- `.github/workflows/quality.yml` riga 27 — `pnpm lint -- --max-warnings 0`
  ha un `--` di troppo (il doppio `--` fa passare il comando in modo errato a
  eslint; sostituire con `pnpm lint --max-warnings 0`).

Complessità: **bassa** — modifiche puntuali.
Dipendenze: nessuna.

---

## 6. Gate finale (BASSO)

Eseguire nell'ordine:

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level high
pnpm lint --max-warnings 0
pnpm type-check
pnpm test:run
python3 scripts/verify-database-schema.py
python3 scripts/test-settlement-real-db.py
pnpm build
```

Poi verificare: GitHub Actions verde, Vercel verde, Northflank verde, rilancio
visibile su due browser entro ~1s.

Complessità: **bassa** — solo esecuzione.
Dipendenze: da tutti i punti precedenti.

---

## Riepilogo complessità/dipendenze

| Punto | Complessità | Dipende da |
|---|---|---|
| 1. Recupero claim scaduti | media | — |
| 2. Rimuovere fire-and-forget | bassa-media | 3 |
| 3. Tick outbox a 1s | media | 2 |
| 4. Test realtime | media | 1,2,3 |
| 5. Lint e CI | bassa | — |
| 6. Gate finale | bassa | tutti |

Ordine consigliato: **1 → 3 → 2 → 4 → 5 → 6** (il tick outbox prima della
rimozione del fire-and-forget, così il realtime non degrada mai).

Commit atomici: `outbox: reclaim stale claims`, `outbox: dedicated scheduler
tick`, `bid: drop fire-and-forget dispatch`, `test: realtime contract`,
`lint/CI fixes`, `chore: final gate`.
