# PERF-002 — Ridurre la waterfall post-bid

## Obiettivo
Ridurre round-trip libSQL e latenza percepita dell'offerta.

## Problema
Dopo il commit vengono eseguite numerose letture seriali per costruire il payload, seguite dalla chiamata Socket.IO.

## Root Cause
Dati già noti non restituiti dalla transazione e query indipendenti non consolidate.

## Soluzione
Strumentare prima il percorso; restituire i dati noti dal comando; usare query join/returning quando appropriato; parallelizzare solo letture indipendenti; applicare REL-006 alla delivery.

## File coinvolti
`src/lib/db/services/bid.service.ts`, repository/query helper, `src/lib/socket-emitter.ts`, test payload e benchmark.

## Modifiche
Result DTO del commit, query consolidate e tracing query-count/duration.

## Compatibilità
Il payload realtime e la risposta pubblica devono restare semanticamente identici; evitare letture stale dopo il commit.

## Test
Snapshot payload, concorrenza, DB remoto/latency injection e failure emitter.

## Verifica
Confrontare baseline e risultato per query count, p50/p95/p99 e tempo socket escluso/incluso.

## Criteri di accettazione
- Riduzione misurata dei round-trip.
- Nessuna regressione dei dati evento.
- p95 target definito e rispettato.
- Test concorrenza verdi.

## Rischi
Join troppo costose o payload basato su stato non coerente; guidare le modifiche con trace e query plan.
