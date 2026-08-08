# Task list — Completamento Issue #13 (Socket.IO: dedup cache + disconnect timer)

**Stato: Fasi A–E completate (commit `e12599b`+`ebc04e5`+`e63f6e5` su branch `fix/socket-issue13`, PR verso `main`).** Spunta ogni checkbox solo a lavoro completato e verificato.

## Contesto essenziale

- `socket-server.ts` (radice repo): server Socket.IO single-process; su `disconnect` pianifica un `setTimeout` (default 10s, iniettabile via `disconnectTimeoutMs`) che, se non ci sono più socket dell'utente, chiama `recordUserLogout(userId, disconnectedAt)`. Timer tracciati in `disconnectTimers`, puliti su reconnect e su `close()`.
- Client (`src/contexts/SocketContext.tsx`): reconnect automatico + `join-user-room` su `connect`; heartbeat HTTP su `auction-state`/`auction-states`.
- `recordUserLogout(userId, notAfter?)` (`src/lib/db/services/session.service.ts`): guardia `last_heartbeat <= notAfter` già presente — **non toccare**.
- Indice univoco parziale esiste solo in `database/schema.sql` (riga 19) — manca la migrazione per i DB già migrati.
- DB: `@libsql/client` (Turso); in test `:memory:`.
- `applySchemaToDb` (`src/lib/db/utils.ts`) riapplica tutto a ogni avvio (idempotente solo grazie a `IF NOT EXISTS`) — la migrazione sanante NON è idempotente, va tracciata.

## Fase A — Refactor `socket-server.ts` (closure + mappe) ✅ COMPLETATA

- [x] **A1. Stato in closure.** Dentro `createSocketServer`: `userSockets = Map<userId, Set<socket.id>>`, `disconnectTimers = Map<userId, timer>`, `disconnectTimeoutMs = opts.disconnectTimeoutMs ?? 10_000`. Niente stato a module scope (test e restart nello stesso processo non devono condividere stato).
- [x] **A2. Cancel timer su `connection`.** In `io.on("connection")` (userId già su `socket.data.userId`): aggiungere `socket.id` al set; se `disconnectTimers.has(userId)` → `clearTimeout` + `delete` (il reconnect cancella il logout programmato, senza aspettare `join-user-room`).
- [x] **A3. Logout solo su ultimo socket.** In `io.on("disconnect")`: rimuovere `socket.id`; se il set è ora vuoto → pianificare il timer con guardia `if (!userSockets.get(userId)?.size)` → `recordUserLogout(userId, disconnectedAt)` in try/catch (log su errore) e `finally` con guardia anti-stale `if (disconnectTimers.get(userId) === timer) disconnectTimers.delete(userId)`.
- [x] **A4. Cleanup in `close()`.** Prima di `io.close()`: `clearTimeout` su tutti i timer pendenti + `disconnectTimers.clear()`.
- [x] **A5. Opzione iniettabile.** Estendere `opts`/`SocketServerHandle` con `disconnectTimeoutMs?: number` (default 10_000).

## Fase B — Retry limitato su `updateHeartbeat`/`recordUserLogin`

File: `src/lib/db/services/session.service.ts`

- [x] **B1. Helper `isUniqueConflictError(error)`**: `code === "SQLITE_CONSTRAINT_UNIQUE"` oppure messaggio contenente `"UNIQUE constraint failed"`.
- [x] **B2. `updateHeartbeat` con retry (1 solo tentativo)**: UPDATE → se 0 righe → INSERT; se l'INSERT fallisce per unique conflict (l'altro concorrente ha già inserito) → ripeti l'UPDATE una volta; se il secondo UPDATE dà 0 righe → warning senza eccezione. Ogni altro errore dell'INSERT → propaga.
- [x] **B3. `recordUserLogin`**: stesso pattern SELECT-then-INSERT/UPDATE con la stessa protezione.

## Fase C — Migrazione sanante indice univoco

- [x] **C1. File SQL** `database/migrations/add_unique_active_session_index.sql` (solo SQL, transazione gestita dal runner):
  - UPDATE duplicati aperti: `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COALESCE(last_heartbeat, session_start) DESC, id DESC)` → chiudi i `rn > 1` con `session_end = COALESCE(last_heartbeat, session_start)` (storico conservato, niente DELETE).
  - `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique_active ON user_sessions(user_id) WHERE session_end IS NULL`.
- [x] **C2. `applyMigrationFile(client, filePath)`** in `src/lib/db/utils.ts`: transazione atomica con `client.batch([...statements, INSERT tracking], "write")` (NON `BEGIN`/`COMMIT` manuali: su Turso HTTP ogni `execute()` è una richiesta separata, lo stato non è garantito; `batch` è l'API ufficiale portabile file+remoto). Su errore il batch fa rollback + rethrow.
- [x] **C3. Tracking migrazioni**: tabella `schema_migrations` (id, file_name UNIQUE, applied_at); se `file_name` già presente → skip; altrimenti esegui migrazione + registrazione nello stesso batch (tracking atomico). Runner `runMigrations(client)` in `utils.ts` applica tutti i file di `database/migrations/` in ordine alfabetico; chiamato da `src/lib/db/migrate.ts` dopo lo schema full.

## Fase D — Test

### D1. Socket integration — `tests/socket/integration.socket.test.ts` (fake timer/mock, NO DB) ✅ COMPLETATA

- [x] **D1.0. Setup**: estendere `startSocketServerForTest` per passare `{ disconnectTimeoutMs: 50 }`. Priorità al timeout configurabile; fake timer solo se non interferisce con l'handshake socket.io.
- [x] **D1.1. Reconnect entro la finestra** → nessun `recordUserLogout` (timer cancellato su `connection`).
- [x] **D1.2. Reconnect dopo la scadenza** → `recordUserLogout` chiamato con `disconnectedAt` del primo disconnect.
- [x] **D1.3. Ultimo socket** → 2 socket: chiudi 1 → nessun logout; chiudi entrambi → logout.
- [x] **D1.4. Callback obsoleto non cancella timer nuovo** (guardia `=== timer`).
- [x] **D1.5. `close()` pulisce i timer** → nessun `recordUserLogout` successivo.
- [x] **D1.6. Aggiornare il test esistente "records logout on disconnect"** da attesa reale 11s a timeout configurabile/fake timer.

### D2. Session integration — `tests/session/session.integration.test.ts` (libSQL `:memory:` reale, NO mock)

- [x] **D2.1. Heartbeat concorrente** → N `updateHeartbeat` paralleli sullo stesso user → tutti completano, una sola sessione aperta, nessun errore (verifica il retry).
- [x] **D2.2. Guardia `last_heartbeat <= disconnectedAt`** → heartbeat recente → 0 righe, sessione aperta; heartbeat vecchio → sessione chiusa.
- [x] **D2.3. Migrazione sanante** → duplicati aperti → esegui migrazione → una sola aperta, le altre chiuse con `COALESCE(last_heartbeat, session_start)`, indice creato.
- [x] **D2.4. Indice univoco** → dopo la migrazione, secondo INSERT aperto fallisce con unique conflict.
- [x] **D2.5. Tracking migrazione** → seconda esecuzione della stessa migrazione → skip (nessun UPDATE ripetuto).

## Fase E — PR atomica

- [x] **E1. Branch dedicato** (es. `fix/socket-issue13`) e commit: `fix(socket): harden disconnect timers, race-safe heartbeat upsert, unique active session index migration`.
- [ ] **E2. PR verso `main`** contenente: `socket-server.ts`, `session.service.ts`, `utils.ts`, migrazione SQL, test (socket + session), estensione dello stub di test.

## Verifica finale (prima della PR)

- [x] **V1.** `pnpm test:run` (Vitest) — tutti verdi, inclusi i nuovi test socket e session.
- [x] **V2.** `pnpm test:e2e` — verdi (nessuna regressione su ghost-session, response timers).
- [x] **V3.** Migrazione su DB di test con duplicati aperti → 1 sola sessione aperta per utente, storici chiusi con `COALESCE`, indice creato, seconda esecuzione → skip.
- [x] **V4.** Smoke manuale: avviare socket-server; 2 tab, chiudi 1 → nessun logout; chiudi entrambe → logout dopo 10s; reconnect entro 10s → nessun logout. *(Coperto dai test di integrazione socket D1.1/D1.2/D1.3 con `disconnectTimeoutMs: 50`; la spec Playwright `two-leagues-two-tabs` richiede DB di test autenticato non disponibile qui.)*

## Rischi e mitigazioni (da tenere presenti)

| Rischio | Livello | Mitigazione |
| --- | --- | --- |
| Race heartbeat con indice univoco (INSERT concorrente) | Alto | Retry limitato a 1 solo per unique conflict; altri errori propagano. Test concorrente con libSQL in-memory. |
| Migrazione non atomica / riapplicata a ogni avvio | Alto | `applyMigrationFile` con `BEGIN/COMMIT/ROLLBACK` + tabella `schema_migrations` (nella stessa transazione). |
| Fake timer fragili con socket.io | Medio | Priorità a `disconnectTimeoutMs` iniettabile (50ms) nei test. |
| `close()` non pulisce timer → processo con timer vivi | Medio | Cleanup in `close()` + test dedicato. |
| Regressione `join-user-room` / comportamento socket | Basso | Il cancel è su `connection`; il client emette sempre `join-user-room` su connect. |
| Socket connesso ma mai in room ora tiene viva la sessione | Basso | Voluto: tracciamento su `connection` più preciso. |
| `applySchemaToDb` esistente non toccato | Basso | La migrazione usa un runner separato; `schema.sql` resta la fonte per i DB nuovi. |

---

# Guida ai test (lezione dal debug di oggi — non ripetere questi errori)

## Comandi

| Cosa | Comando |
| --- | --- |
| Tutta la suite Vitest | `pnpm test:run` (alias `pnpm exec vitest run`) |
| Solo test socket | `pnpm exec vitest run tests/socket` |
| Solo un file | `pnpm exec vitest run tests/socket/integration.socket.test.ts` |
| Solo un test | `pnpm exec vitest run -t "records logout on disconnect"` |
| Test e2e | `pnpm exec vitest run tests/e2e` |
| Typecheck | `pnpm exec tsc --noEmit` (alias `pnpm type-check`) |

> `pnpm exec` con il binario locale (`./node_modules/.bin/vitest`) evita che pnpm chieda di reinstallare `node_modules`.

## Ambienti di test (fondamentale)

- **`vitest.config.ts`** usa `environmentMatchGlobs`:
  - `tests/socket/**` → **node** (serve `http`, `async_hooks` reali)
  - `tests/e2e/**` e altri file di test → **jsdom** (browser)
- **I test che toccano il server socket DEVONO stare in `tests/socket/`**, altrimenti vitest li esegue in jsdom e `node:http` viene esternalizzato (errore `default.createServer is not a function`).
- `node:http` esplicito (non `http`): in node environment funziona, in jsdom no.

## Pattern obbligatorio per i test socket (seams confermate)

1. **Mai aspettare i tempi reali (10s)**. Usa `startSocketServerForTest({ disconnectTimeoutMs: 50 })` — l'opzione è iniettabile. I fake timer con socket.io sono fragili (handshake usa timer interni), quindi **timeout configurabile + attesa reale breve** è la priorità.
2. **`connect()`** helper che risolve su `connect` e rifiuta su `connect_error`, con `transports: ["websocket"]` e `reconnection: false`.
3. **Chiudi i socket con `closeAndWait(client, expectedRemaining)`** — MAI con `client.close()` nudo:
   - `client.close()` è **asincrono lato server**: il server vede il disconnect solo dopo un giro di event loop.
   - Se chiudi senza aspettare, il socket **fantasma** resta nel `userSockets` del server e inquina i test successivi (sembrano "non disconnettersi mai").
   - `closeAndWait` chiude il client e poi **polla `handle.io.sockets.sockets.size`** finché non scende al valore atteso (default 0). Passa `expectedRemaining = N` quando altri socket dello stesso utente restano vivi.
   - Senza questo, i test con 2+ socket falliscono in modo casuale e i log del server mostrano set che si accumulano tra i test.
4. **Ogni test deve lasciare il sistema pulito**: dopo `closeAndWait`, aspetta `sleep(200)` (> `disconnectTimeoutMs` + latenza) così i timer pendenti sparano DENTRO il test, non nel successivo.
5. **`afterEach`**: `sleep(250)` (copre timer pendenti + latenza close) poi `recordUserLogoutMock.mockClear()`. Senza, un timer rimasto vivo da un test chiama il mock durante il test successivo.
6. **Testare il comportamento, non l'implementazione**: osserva il mock `recordUserLogout` (boundary = DB) con `toHaveBeenCalledTimes`/`toHaveBeenNthCalledWith`. Non interrogare le mappe interne del server.
7. **Le aspettative vanno calibrate sul comportamento reale**: es. "reconnect entro la finestra" significa *un socket resta connesso* → nessun logout. Se chiudi TUTTI i socket, il logout scatta — il test deve aspettarselo.
8. **Mock a module scope** (`vi.mock`) con path **identici** a quelli del server (`@/lib/db/services/session.service`). Il server usa l'alias `@/` per i moduli DB — il mock deve usare lo stesso identico path, non `./src/...` né con `.js`.
9. **`beforeEach`/`afterEach` vanno importati** da `vitest` (i globals non sono tipizzati in questi file) — altrimenti TSC fallisce.

## Anti-pattern da evitare (visti oggi)

- **`client.close()` senza attesa** → socket fantasma che inquinano i test successivi.
- **Attese reali lunghe** (11s) → test lenti e fragili.
- **Fake timer globali** (`vi.useFakeTimers()`) → interferiscono con l'handshake socket.io.
- **Mock su path relativi** (`./src/lib/...`) → due istanze del modulo, il mock non registra le chiamate.
- **Log di debug lasciati nel codice** → rimuovili prima del commit (usali solo per diagnosticare).
- **Sniffing dello stato interno** del server (le mappe) invece del comportamento osservabile.
 
## Se un test socket fallisce

1. Esegui SOLO quel file (`pnpm exec vitest run tests/socket/integration.socket.test.ts`) per escludere interferenze tra test.
2. Controlla i log del server: se il set `userSockets` si accumula tra test → manca `closeAndWait`.
3. Verifica che il mock `recordUserLogout` venga chiamato (aggiungi un `console.log` temporaneo nel mock).
4. Se il fallimento è di timing, aumenta `sleep` ma NON tornare a 10s reali.
