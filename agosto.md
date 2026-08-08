# Task list — Completamento Issue #13 (Socket.IO: dedup cache + disconnect timer)

**Stato: da iniziare.** Spunta ogni checkbox solo a lavoro completato e verificato.

## Contesto essenziale

- `socket-server.ts` (radice repo, 144 righe): server Socket.IO single-process; su ogni `disconnect` fa un `setTimeout` anonimo di 10s che, se la room `user-${userId}` è vuota, chiama `recordUserLogout(userId, disconnectedAt)`. Timer non tracciati né cancellati.
- Client (`src/contexts/SocketContext.tsx`): reconnect automatico + `join-user-room` su `connect`; heartbeat HTTP su `auction-state`/`auction-states`.
- `recordUserLogout(userId, notAfter?)` (`src/lib/db/services/session.service.ts`): guardia `last_heartbeat <= notAfter` già presente — **non toccare**.
- Indice univoco parziale esiste solo in `database/schema.sql` (riga 19) — manca la migrazione per i DB già migrati.
- DB: `@libsql/client` (Turso); in test `:memory:`.
- `applySchemaToDb` (`src/lib/db/utils.ts`) riapplica tutto a ogni avvio (idempotente solo grazie a `IF NOT EXISTS`) — la migrazione sanante NON è idempotente, va tracciata.

## Fase A — Refactor `socket-server.ts` (closure + mappe)

- [ ] **A1. Stato in closure.** Dentro `createSocketServer`: `userSockets = Map<userId, Set<socket.id>>`, `disconnectTimers = Map<userId, timer>`, `disconnectTimeoutMs = opts.disconnectTimeoutMs ?? 10_000`. Niente stato a module scope (test e restart nello stesso processo non devono condividere stato).
- [ ] **A2. Cancel timer su `connection`.** In `io.on("connection")` (userId già su `socket.data.userId`): aggiungere `socket.id` al set; se `disconnectTimers.has(userId)` → `clearTimeout` + `delete` (il reconnect cancella il logout programmato, senza aspettare `join-user-room`).
- [ ] **A3. Logout solo su ultimo socket.** In `io.on("disconnect")`: rimuovere `socket.id`; se il set è ora vuoto → pianificare il timer con guardia `if (!userSockets.get(userId)?.size)` → `recordUserLogout(userId, disconnectedAt)` in try/catch (log su errore) e `finally` con guardia anti-stale `if (disconnectTimers.get(userId) === timer) disconnectTimers.delete(userId)`.
- [ ] **A4. Cleanup in `close()`.** Prima di `io.close()`: `clearTimeout` su tutti i timer pendenti + `disconnectTimers.clear()`.
- [ ] **A5. Opzione iniettabile.** Estendere `opts`/`SocketServerHandle` con `disconnectTimeoutMs?: number` (default 10_000).

## Fase B — Retry limitato su `updateHeartbeat`/`recordUserLogin`

File: `src/lib/db/services/session.service.ts`

- [ ] **B1. Helper `isUniqueConflictError(error)`**: `code === "SQLITE_CONSTRAINT_UNIQUE"` oppure messaggio contenente `"UNIQUE constraint failed"`.
- [ ] **B2. `updateHeartbeat` con retry (1 solo tentativo)**: UPDATE → se 0 righe → INSERT; se l'INSERT fallisce per unique conflict (l'altro concorrente ha già inserito) → ripeti l'UPDATE una volta; se il secondo UPDATE dà 0 righe → warning senza eccezione. Ogni altro errore dell'INSERT → propaga.
- [ ] **B3. `recordUserLogin`**: stesso pattern SELECT-then-INSERT/UPDATE con la stessa protezione.

## Fase C — Migrazione sanante indice univoco

- [ ] **C1. File SQL** `database/migrations/add_unique_active_session_index.sql` (solo SQL, transazione gestita dal runner):
  - UPDATE duplicati aperti: `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COALESCE(last_heartbeat, session_start) DESC, id DESC)` → chiudi i `rn > 1` con `session_end = COALESCE(last_heartbeat, session_start)` (storico conservato, niente DELETE).
  - `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_unique_active ON user_sessions(user_id) WHERE session_end IS NULL`.
- [ ] **C2. `applyMigrationFile(client, filePath)`** in `src/lib/db/utils.ts`: transazione esplicita `BEGIN` → `client.executeMultiple(sql)` → `COMMIT`; su errore `ROLLBACK` + rethrow.
- [ ] **C3. Tracking migrazioni**: tabella `schema_migrations` (id, file_name, applied_at); se `file_name` già presente → skip; altrimenti esegui migrazione + registrazione nella stessa transazione (tracking atomico).

## Fase D — Test

### D1. Socket integration — `tests/socket/integration.socket.test.ts` (fake timer/mock, NO DB)

- [ ] **D1.0. Setup**: estendere `startSocketServerForTest` per passare `{ disconnectTimeoutMs: 50 }`. Priorità al timeout configurabile; fake timer solo se non interferisce con l'handshake socket.io.
- [ ] **D1.1. Reconnect entro la finestra** → nessun `recordUserLogout` (timer cancellato su `connection`).
- [ ] **D1.2. Reconnect dopo la scadenza** → `recordUserLogout` chiamato con `disconnectedAt` del primo disconnect.
- [ ] **D1.3. Ultimo socket** → 2 socket: chiudi 1 → nessun logout; chiudi entrambi → logout.
- [ ] **D1.4. Callback obsoleto non cancella timer nuovo** (guardia `=== timer`).
- [ ] **D1.5. `close()` pulisce i timer** → nessun `recordUserLogout` successivo.
- [ ] **D1.6. Aggiornare il test esistente "records logout on disconnect"** da attesa reale 11s a timeout configurabile/fake timer.

### D2. Session integration — `tests/session/session.integration.test.ts` (libSQL `:memory:` reale, NO mock)

- [ ] **D2.1. Heartbeat concorrente** → N `updateHeartbeat` paralleli sullo stesso user → tutti completano, una sola sessione aperta, nessun errore (verifica il retry).
- [ ] **D2.2. Guardia `last_heartbeat <= disconnectedAt`** → heartbeat recente → 0 righe, sessione aperta; heartbeat vecchio → sessione chiusa.
- [ ] **D2.3. Migrazione sanante** → duplicati aperti → esegui migrazione → una sola aperta, le altre chiuse con `COALESCE(last_heartbeat, session_start)`, indice creato.
- [ ] **D2.4. Indice univoco** → dopo la migrazione, secondo INSERT aperto fallisce con unique conflict.
- [ ] **D2.5. Tracking migrazione** → seconda esecuzione della stessa migrazione → skip (nessun UPDATE ripetuto).

## Fase E — PR atomica

- [ ] **E1. Branch dedicato** (es. `fix/socket-issue13`) e commit: `fix(socket): harden disconnect timers, race-safe heartbeat upsert, unique active session index migration`.
- [ ] **E2. PR verso `main`** contenente: `socket-server.ts`, `session.service.ts`, `utils.ts`, migrazione SQL, test (socket + session), estensione dello stub di test.

## Verifica finale (prima della PR)

- [ ] **V1.** `pnpm test:run` (Vitest) — tutti verdi, inclusi i nuovi test socket e session.
- [ ] **V2.** `pnpm test:e2e` — verdi (nessuna regressione su ghost-session, response timers).
- [ ] **V3.** Migrazione su DB di test con duplicati aperti → 1 sola sessione aperta per utente, storici chiusi con `COALESCE`, indice creato, seconda esecuzione → skip.
- [ ] **V4.** Smoke manuale: avviare socket-server; 2 tab, chiudi 1 → nessun logout; chiudi entrambe → logout dopo 10s; reconnect entro 10s → nessun logout.

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
