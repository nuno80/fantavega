# REL-003 — Rilasciare correttamente i crediti bloccati

## Obiettivo
Mantenere `locked_credits` uguale all'esposizione attiva dopo ogni settlement.

## Problema
I perdenti sono cercati dopo aver disattivato tutte le auto-offerte; sull'ultima asta la riconciliazione periodica può non selezionare la lega.

## Root Cause
Ordine delle query e ambito del reconciler non allineati alla mutazione.

## Soluzione
Raccogliere gli utenti interessati prima della disattivazione o ricalcolare la lega nello stesso transaction boundary; ampliare il reconciler come safety net e aggiungere invarianti osservabili.

## File coinvolti
`src/lib/db/services/bid.service.ts`, `src/lib/db/services/locked-credits.service.ts`, scheduler settlement e test integrazione.

## Modifiche
Ordine query, set utenti/lega da riconciliare, metriche di mismatch. Evitare due fonti di calcolo divergenti.

## Compatibilità
Preservare regole winner/budget e prestazioni del settlement; eseguire una verifica read-only dei mismatch live prima di una correzione dati separatamente autorizzata.

## Test
Ultima asta, più perdenti, auto-bid disattive, settlement concorrente, retry e riconciliazione idempotente.

## Verifica
Per ogni utente, valore denormalizzato e somma delle esposizioni attive coincidono dopo il commit.

## Criteri di accettazione
- Test runtime end-to-end verde.
- Nessun credito fantasma sull'ultima asta.
- Reconciler copre leghe potenzialmente incoerenti.

## Rischi
Contesa o costo di ricalcolo dell'intera lega; preferire set minimo corretto e safety net batch.
