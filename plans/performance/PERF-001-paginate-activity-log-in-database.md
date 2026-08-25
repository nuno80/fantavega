# PERF-001 — Paginare l'activity log nel database

## Obiettivo
Rendere costo e latenza proporzionali alla pagina richiesta.

## Problema
L'endpoint carica tutte le sorgenti, materializza e ordina l'intera storia, poi applica la pagina in memoria.

## Root Cause
Fan-out non limitato e modello eventi eterogeneo senza ordinamento/paginazione comune.

## Soluzione
Definire cursor stabile `(event_time, type, id)`; preferire event table normalizzata o `UNION ALL` paginata; in alternativa top-N per sorgente con merge corretto; aggiungere indici dopo `EXPLAIN`.

## File coinvolti
`src/app/api/leagues/[league-id]/activity-log/route.ts`, query service, `src/lib/db/schema.sql`/migration indici, test e benchmark.

## Modifiche
DTO cursor, query limitata, count opzionale/separato, indici lega+timestamp. Ogni migration richiede rollout DB dedicato.

## Compatibilità
Mantenere temporaneamente page/limit o versionare l'API; ordinamento deterministico per eventi con stesso timestamp.

## Test
Parità con output corrente, eventi a timestamp uguale, insert durante paging, 10k/100k/1M eventi.

## Verifica
Query plan usa indici; righe lette e memoria restano O(page size); p95 rispetta la soglia definita.

## Criteri di accettazione
- Nessuna query full-history per pagina.
- Nessun duplicato/buco nel paging.
- Benchmark e query plan archiviati.
- Compatibilità client verificata.

## Rischi
Cursor instabile e semantica count; usare tie-breaker unico e documentare consistenza durante nuovi eventi.
