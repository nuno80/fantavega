# CQ-002 — Sanitizzare logging ed errori production

## Obiettivo
Conservare osservabilità utile senza esporre PII, strategie, token o dettagli interni.

## Problema
Log ad-hoc includono dati di richiesta/asta e alcuni handler restituiscono messaggi upstream o stack.

## Root Cause
Nessun logger strutturato con redaction né contratto unico degli errori pubblici.

## Soluzione
Definire classificazione dati; introdurre logger con livelli, correlation ID e redaction; errori pubblici con codice stabile; dettagli solo server-side; definire retention/accesso e sampling.

## File coinvolti
Route API, servizi bid/timer/socket, helper error response, configurazione osservabilità e test.

## Modifiche
Wrapper logger/error mapper, rimozione `console` sensibili, allowlist dei campi loggabili e metriche separate dai log.

## Compatibilità
Preservare codici/status attesi dai client o versionarli; non loggare valori delle env durante la startup validation.

## Test
Payload sentinella con email/token/massimale/stack, snapshot risposta production, correlation ID e livelli environment-specific.

## Verifica
Scansione automatica di output e risposte non trova i sentinella; gli eventi operativi critici restano ricercabili.

## Criteri di accettazione
- Nessun segreto/PII non necessario nei log.
- Nessuno stack al client.
- Error code stabile e documentato.
- Retention e accesso definiti.

## Rischi
Redaction eccessiva che ostacola diagnosi; mantenere identificatori pseudonimi e metriche aggregate.
