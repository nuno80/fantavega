# SEC-004 — Applicare rate limit distribuito al confine di business

## Obiettivo
Limitare coerentemente offerte e altre operazioni costose su tutte le istanze e tutti i transport.

## Problema
La `Map` locale perde stato fra cold start/istanze e la Server Action usata dalla UI non attraversa il limiter REST.

## Root Cause
Limiter nel transport layer e storage non condiviso.

## Soluzione
Definire policy e chiavi; implementare contatore atomico condiviso con TTL; invocarlo nel servizio comune prima della mutazione; restituire retry metadata coerente.

## File coinvolti
`src/lib/rate-limiter.ts`, `src/lib/actions/auction.actions.ts`, route bids, servizio bid e test.

## Modifiche
Interfaccia `RateLimiter`, adapter distribuito, error mapping 429 per API/Action, metriche allow/deny.

## Compatibilità
Fail-open o fail-closed deve essere decisione esplicita per outage dello storage. Evitare di bloccare retry idempotenti già committati.

## Test
Concorrenza, finestre temporali con fake clock, due istanze, API e Server Action, indisponibilità storage.

## Verifica
Lo stesso utente non supera la policy sommando chiamate su transport/istanze differenti.

## Criteri di accettazione
- Policy unica e documentata.
- Contatore atomico distribuito.
- Test di bypass e failure verdi.
- Nessuna doppia offerta causata dai retry.

## Rischi
Latenza e falso positivo durante picchi; mitigare con soglie misurate, timeout brevi e osservabilità.
