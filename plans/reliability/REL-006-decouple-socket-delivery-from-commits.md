# REL-006 — Disaccoppiare delivery Socket.IO dai commit

## Obiettivo
Restituire risultati coerenti con il database e rendere recuperabili gli eventi realtime.

## Problema
Le notifiche fallite dopo il commit fanno fallire l'API; un rollback post-commit non può annullare la mutazione.

## Root Cause
Commit e delivery remota trattati come una singola operazione senza protocollo distribuito.

## Soluzione
Classificare eventi essenziali/non essenziali; usare outbox transazionale per i primi e best-effort osservabile per i secondi; restituire successo dopo commit; rimuovere rollback post-commit; validare env all'avvio.

## File coinvolti
`src/lib/socket-emitter.ts`, servizi bid/response-timer/penalty, worker scheduler, schema/migration se outbox, `README.md` e test.

## Modifiche
Interfaccia publisher, dispatcher idempotente, event ID, retry/backoff/dead-letter e metriche. Migrazione outbox solo dopo piano DB approvato.

## Compatibilità
Mantenere payload/event names dei client; rollout dual-write o feature flag; client continua a fare refetch su reconnect.

## Test
Secret assente, timeout, 500 Socket server, crash dopo commit, duplicazione delivery e recovery outbox.

## Verifica
DB committato produce risposta di successo; eventi essenziali vengono consegnati almeno una volta e consumati idempotentemente.

## Criteri di accettazione
- Nessun errore API ambiguo post-commit.
- Nessun rollback dopo commit.
- Env documentate e validate senza leakage.
- Backlog/retry osservabili.

## Rischi
Delivery duplicata e crescita outbox; richiedono consumer idempotenti, retention e alert.
