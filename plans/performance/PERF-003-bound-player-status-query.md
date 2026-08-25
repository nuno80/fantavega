# PERF-003 — Limitare players-with-status

## Obiettivo
Imporre un costo massimo prevedibile alle richieste di catalogo/stato.

## Problema
`page` e `limit` non hanno minimo/massimo; valori negativi o enormi possono rimuovere di fatto il limite e amplificare query successive.

## Root Cause
Parsing ad-hoc senza schema di input condiviso.

## Soluzione
Validare interi positivi; definire default e cap basati sull'uso UI; rifiutare o clampare in modo documentato; limitare anche filtri/liste; valutare cursor.

## File coinvolti
Route players-with-status, eventuale schema Zod/helper query params, chiamanti UI e test.

## Modifiche
Schema parametri, response 400 o cap, metadata paging.

## Compatibilità
Ispezionare prima i chiamanti che richiedono batch elevati e introdurre paginazione client se necessario.

## Test
Assente, zero, negativo, NaN, overflow, oltre cap e boundary valido.

## Verifica
Ogni query applica un limite positivo entro il cap e i chiamanti completano il flusso.

## Criteri di accettazione
- Input invalido gestito deterministicamente.
- Cap server-side non aggirabile.
- UI senza regressioni.

## Rischi
Catalogo incompleto per client che assume risposta unica; migrare il chiamante prima di abbassare il cap.
