# TIME-002 — Rinnovare il lease o claimare il lavoro scheduler

## Obiettivo
Impedire che due istanze elaborino lo stesso lavoro quando una run supera il TTL.

## Problema
Lease di 45 secondi senza rinnovo, mentre i task sono sequenziali e possono dipendere da round-trip remoti.

## Root Cause
Lock globale a scadenza fissa e flag locale per processo.

## Soluzione
Misurare durata/backlog; scegliere heartbeat con owner token+fencing oppure claim atomico per batch/item; rinnovare prima della soglia; interrompere i commit se la ownership è persa.

## File coinvolti
`src/lib/db/services/scheduler-lease.service.ts`, `src/lib/db/services/scheduler.ts`, servizi task e test scheduler.

## Modifiche
Token monotono/fencing, compare-and-set di rinnovo/rilascio, metriche lease age/run duration e batch limit.

## Compatibilità
Supportare una finestra di rollout con istanze vecchie e nuove oppure eseguire rollout coordinato. Non affidarsi all'orologio locale per decisioni DB.

## Test
Fake clock oltre TTL, due istanze, owner crashato, rinnovo fallito, latenza DB e retry duplicato.

## Verifica
Un solo owner autorizzato committa ogni item; perdita lease viene rilevata e segnalata.

## Criteri di accettazione
- Nessuna overlap oltre TTL nei test.
- Rilascio condizionato all'owner.
- Durata e lag monitorati.
- Task idempotenti o fenced.

## Rischi
Lease zombie, clock skew e starvation; usare tempo DB, TTL prudente e claim limitati.
