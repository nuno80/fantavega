# REL-004 — Rendere atomici gli aggiustamenti budget

## Obiettivo
Assicurare coerenza tra saldo e ledger sotto concorrenza e failure.

## Problema
Read-modify-write del saldo e inserimento ledger sono separati; sono possibili lost update e audit incompleto.

## Root Cause
Mancanza di una singola transazione con update aritmetico condizionale.

## Soluzione
Eseguire `UPDATE balance = balance + delta` con guard sul saldo, recuperare il valore DB e inserire il ledger nello stesso commit; introdurre idempotency key per retry amministrativi.

## File coinvolti
`src/lib/actions/league.actions.ts`, servizio budget/transaction, eventuale migration per chiave idempotenza, test.

## Modifiche
Spostare la logica in servizio transazionale e restituire un risultato tipizzato; l'eventuale migration è un piano/deploy separato e reversibile.

## Compatibilità
Preservare semantica importi e messaggi UI; definire arrotondamento e range numerico.

## Test
Due incrementi concorrenti, incremento/decremento, saldo insufficiente, failure ledger, doppio retry stessa chiave.

## Verifica
Saldo finale deterministico e somma ledger coerente in ogni interleaving.

## Criteri di accettazione
- Saldo e ledger committano insieme.
- Nessun lost update.
- Retry idempotente.
- Controllo saldo eseguito dal DB.

## Rischi
Compatibilità libSQL delle clausole SQL e deadlock/retry; validare sullo stesso motore remoto in preview.
