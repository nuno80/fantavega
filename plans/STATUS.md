# Stato avanzamento fix

Ultimo aggiornamento: 2026-08-25

## Legenda

- ✅ **Completato** — commit isolato su `main` + test verdi
- 🟡 **In corso** — codice scritto nel working tree, non ancora committato/revisionato
- ⏸️ **Aperto** — nessuna modifica iniziata

**Complessità** = sforzo di implementazione (Bassa / Media / Alta).
**Rischio** = probabilità×impatto di regressioni/downtime su **Turso (remoto)** — il DB locale non esiste più, ogni valutazione assume solo libSQL remoto.

## Riepilogo

| Fix |          Stato     | Commit | Complessità | Rischio | Note |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | ✅ Completato | `6895a1a` | Media | Media | Upgrade Clerk/Next + guard admin route-level |
| SEC-002 | ✅ Completato | `c0717bf` | Bassa | Bassa | Endpoint debug/task admin induriti |
| REL-003 | ✅ Completato | `7692ffd` | Media | Media | Riconciliazione `locked_credits` sul settlement |
| REL-001 | ✅ Completato | `a632101` | Alta | Media | Bootstrap vuoto + upgrade legacy + drift detection |
| SEC-003 | ✅ Completato | `781b875` | Media | Media | Parser Excel sicuro + budget upload |
| REL-002 | ✅ Completato | `d35ee11` | Media | Media | Import replace atomico |
| REL-004 | ✅ Completato | `1c5bea6` | Media | Media | Budget/ledger atomici |
| REL-005 | ⏸️ Aperto | — | Bassa | Media | Cambio ruolo Clerk |
| REL-006 | ⏸️ Aperto | — | Alta | Alta | Delivery Socket.IO disaccoppiata |
| SEC-004 | ✅ Completato | `3b011ad` | Media | Media | Rate limit distribuito |
| SEC-005 | ⏸️ Aperto | — | Media | Media | Policy lettura leghe (richiede decisione prodotto) |
| CQ-001 | ✅ Completato | `1a39567` | Bassa | Media | Quality gate lint (restano solo 6 warning `no-img-element`, budget CI rimandato) |
| CQ-002 | ✅ Completato | `5d643f2` | Media | Bassa | Logger strutturato + redaction PII + error contract pubblico |
| PERF-001 | ⏸️ Aperto | — | Alta | Media | Paginazione activity log |
| PERF-002 | ⏸️ Aperto | — | Media | Media | Waterfall post-bid |
| PERF-003 | ⏸️ Aperto | — | Bassa | Bassa | Cap players-with-status |
| TIME-001 | ⏸️ Aperto | — | Alta | Alta | Effetti timer post-bid durabili |
| TIME-002 | ⏸️ Aperto | — | Alta | Alta | Lease scheduler rinnovabile |

## Dettagli in corso

## Complessità e rischio per task

> **Nota DB:** il DB locale non esiste più — si usa solo **Turso (libSQL remoto)**. I test su `:memory:` restano rappresentativi del motore ma non della latenza/contesa di rete: ogni task con transazioni, lock o query paginate va validato in preview contro l'istanza remota, non solo in locale.

### SEC-001 — Upgrade Clerk/Next + guard admin route-level ✅

- **Complessità Media**: upgrade di due framework con API breaking potenziali.
- **Rischio Media**: regressioni auth nel runtime Clerk e nel middleware; va rifatto smoke login/revalidate prima del deploy.

### SEC-002 — Endpoint debug/task induriti ✅

- **Complessità Bassa**: guard e check di ruolo su handler esistenti.
- **Rischio Bassa**: rischio contenuto, superfici admin già limitate.

### REL-003 — Riconciliazione `locked_credits` sul settlement ✅

- **Complessità Media**: aritmetica saldo/ledger con più percorsi da coprire.
- **Rischio Media**: tocca soldi (crediti); una riconciliazione errata altera saldi reali.

### REL-001 — Bootstrap vuoto + upgrade legacy + drift detection ✅

- **Complessità Alta**: manifest migrazioni, baseline deterministico, preflight e recovery crash.
- **Rischio Media**: su Turso remoto un bootstrap sbagliato su un DB esistente è irreversibile senza backup; mitigato dal preflight zero-mutation.

### SEC-003 — Parser Excel sicuro + budget upload ✅

- **Complessità Media**: parser in worker_threads, limiti heap/concorrenza/timeout, preflight ZIP.
- **Rischio Media**: superficie di input non fidata; fallire il preflight/zip-bomb o il cap può bloccarsi o rigettare file legittimi.

### REL-002 — Import replace atomico ✅

- **Complessità Media**: refactor write path in un solo `batch("write")`.
- **Rischio Media**: replace distrugge catalogo+rose; la validazione pre-scrittura e il batch atomico riducono l'esposizione, ma resta distruttivo per natura.

### REL-004 — Budget/ledger atomici

- **Complessità Media**: transazione con `UPDATE balance = balance + delta` condizionale + idempotency key.
- **Rischio Media**: lost update e audit incompleto su soldi; da validare la compatibilità SQL di Turso e il comportamento su contesa remota.

### REL-005 — Cambio ruolo Clerk

- **Complessità Bassa**: correggere l'uso della SDK (`await clerkClient()`) e togliere le suppression.
- **Rischio Media**: sovrascrittura metadata e ritardo propagazione session claim; va testato refresh sessione e merge campi.

### REL-006 — Delivery Socket.IO disaccoppiata

- **Complessità Alta**: outbox transazionale, dispatcher idempotente, retry/backoff/dead-letter.
- **Rischio Alta**: delivery duplicata, crescita outbox, rollback post-commit; serve consumer idempotente e retention/alert.

### SEC-004 — Rate limit distribuito

- **Complessità Media**: contatore atomico condiviso con TTL, adapter distribuito.
- **Rischio Media**: latenza e falsi positivi sotto picco; decisione esplicita fail-open vs fail-closed (outage storage) e non bloccare retry idempotenti.

### SEC-005 — Policy lettura leghe

- **Complessità Media**: matrice di autorizzazione centralizzata + DTO filtrati.
- **Rischio Media**: cambio UX/link condivisi non più accessibili; **bloccante**: richiede decisione di prodotto prima di introdurre restrizioni.

### CQ-001 — Quality gate lint

- **Complessità Bassa**: correggere 16 errori + triage warning + job CI.
- **Rischio Media**: correggere hook dependencies può introdurre loop/refetch; no autofix cieco, review mirata sui componenti con hook.

### CQ-002 — Logging/errori production sanitizzati ✅

- **Complessità Media**: logger strutturato con redaction + error mapper pubblico.
- **Rischio Bassa**: nessun dato persistente toccato; attenzione a non loggare env/stack e a non oscurare troppo (diagnosi).

### PERF-001 — Paginazione activity log

- **Complessità Alta**: cursor stabile `(event_time, type, id)`, UNION paginata o event table, indici.
- **Rischio Media**: cursor instabile, semantica count, eventi a timestamp uguale; la migration indici va deployata separatamente su Turso.

### PERF-002 — Ridurre waterfall post-bid

- **Complessità Media**: restituire dati noti dal commit + consolidare letture.
- **Rischio Media**: payload realtime semanticamente identico richiesto; attenzione a letture stale post-commit e join costose.

### PERF-003 — Cap players-with-status

- **Complessità Bassa**: schema input (Zod/helper) con default e cap.
- **Rischio Bassa**: possibile catalogo incompleto per client che assume risposta unica; migrare il chiamante prima di abbassare il cap.

### TIME-001 — Effetti timer post-bid durabili

- **Complessità Alta**: state machine offerta→timer, outbox/job nello stesso commit, consumer idempotente.
- **Rischio Alta**: timer doppi o persi, transazione più lunga; serve outbox se il lavoro non è breve + consumer idempotente.

### TIME-002 — Lease scheduler rinnovabile

- **Complessità Alta**: heartbeat con owner token/fencing o claim atomico per batch.
- **Rischio Alta**: lease zombie, clock skew, starvation; usare tempo DB, TTL prudente e claim limitati.

## Connessioni tra fix e ordine di esecuzione

### Fix connessi (vanno in sequenza, non in parallelo)

**Gruppo A — percorso post-bid/realtime.** Ruotano attorno al momento in cui un'offerta viene committata e ai suoi side effect (notifica Socket.IO + timer). Condividono `bid.service.ts`, `response-timer.service.ts`, `penalty.service.ts`, `auction-states.service.ts`, `socket-emitter.ts` e lo scheduler che li esegue. Ordine obbligato:

1. **REL-006** — definisce il contratto "commit → outbox → dispatcher" e la classificazione eventi essenziali/non essenziali. È il fondamento: TIME-001 e PERF-002 vi si appoggiano.
2. **TIME-001** — riusa lo stesso meccanismo outbox/durable job di REL-006 per rendere durevoli gli effetti timer post-bid. **Un solo meccanismo condiviso**, non un secondo sistema.
3. **PERF-002** — solo ora che commit e side effect sono strutturati, consolida le letture e restituisce i dati già noti dal commit. Ottimizzare prima = lavoro buttato.
4. **TIME-002** — il lease scade (45 s) mentre i task sequenziali sopra vengono riscritti da REL-006/TIME-001; rinnovarlo **dopo** che la struttura dei task è stabile, altrimenti i test del runner vanno rifatti.

### Fix quasi-indipendenti (fondamenta da fare prima del Gruppo A)

> ✅ **CQ-002 completato** (`5d643f2`): `src/lib/logger.ts` (logger JSON strutturato con livelli, correlation ID via AsyncLocalStorage e redaction ricorsiva di PII/secret) + `src/lib/errors.ts` (contratto errori pubblici con code stabile). I fix del Gruppo A devono usare `logger`/`errorResponse` invece di `console.*` o messaggi upstream raw.

### Fix indipendenti (possono andare in parallelo)

| Fix | Perché è indipendente | Nota |
| --- | --- | --- |
| CQ-001 | solo script/config ESLint + CI | farlo **per primo**: alza la soglia così ogni fix successivo parte pulito |
| REL-005 | solo `set-user-role/route.ts` + SDK Clerk | nessun file condiviso |
| SEC-005 | route `api/leagues` + helper accesso | **bloccante**: serve decisione prodotto prima di toccare |
| PERF-001 | solo `activity-log/route.ts` + indici | migration indici = rollout DB separato su Turso |
| PERF-003 | solo `players-with-status` + schema input | banale, prima vittoria rapida |
| REL-004 | `league.actions.ts` + servizio budget | coordina con `processExpiredAuctionsAndAssignPlayers` se quel path tocca saldo/ledger |
| SEC-004 | limiter nel layer di ingresso (prima della mutazione) | può andare in parallelo al Gruppo A, ma attenzione al path bid condiviso |

### Sequenza complessiva consigliata

1. **CQ-001** (lint gate) — subito, indipendente.
2. **CQ-002** (logger/error sanitizzati) ✅ — completato, fondamenta pronte per il Gruppo A.
3. **Gruppo A in sequenza**: REL-006 → TIME-001 → PERF-002 → TIME-002.
4. **Vittorie rapide in parallelo**: PERF-003, REL-005, PERF-001.
5. **REL-004** e **SEC-004** quando c'è banda (indipendenti, ma non mischiarli col Gruppo A per evitare conflitti su `bid.service`/route bid).
6. **SEC-005** — appena la decisione prodotto è disponibile.

### Vincoli trasversali

- **Un solo meccanismo outbox/durable job** condiviso tra REL-006 e TIME-001 (una tabella, un dispatcher/consumer idempotente, un retry/backoff/dead-letter).
- **Consumer idempotente** obbligatorio prima di attivare l'outbox (eventi duplicati, timer doppi).
- **Retention + alert** sull'outbox dal giorno uno.
- **Payload/event name** dei client invariati tra un fix e l'altro.
- Ogni **migration** (schema outbox, indici) va deployata in rollout DB dedicato su Turso, separato dal codice.
