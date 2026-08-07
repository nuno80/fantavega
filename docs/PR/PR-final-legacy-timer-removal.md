# PR finale: rimozione attivazione timer legacy

## Obiettivo

Eliminare qualsiasi attivazione automatica dei timer dovuta a polling, login, heartbeat o reconnect. L’unico ingresso ammesso è il claim `response-timer/viewed`, scoped per user, lega e asta.

## Test Playwright

Sono stati aggiunti test con due tab browser e due leghe. Il database è isolato tramite `E2E_DATABASE_URL` e `E2E_DATABASE_TOKEN`; il test richiede una storage state autenticata e dati seed indipendenti per le due leghe.

Il primo scenario apre le due leghe in tab parallele e verifica che entrambe restino scoped al proprio `leagueId`. Il secondo invia due claim concorrenti sullo stesso timer e verifica che il comportamento sia idempotente senza errori server.

## Guardia anti-regressione

`scripts/assert-no-legacy-timer-activation.mjs` fallisce se trova chiamate a `activateTimersForUser` fuori dal servizio proprietario. La pipeline Playwright la esegue prima dei test browser.

## Dipendenze operative

Questa PR va applicata dopo #35 e #36. Richiede i secret GitHub `E2E_DATABASE_URL` e `E2E_DATABASE_TOKEN`, più le variabili `E2E_LEAGUE_A`, `E2E_LEAGUE_B` e `E2E_AUCTION_ID`.

## Nota di sicurezza

Il test non usa il database di produzione. Se i secret di test non sono configurati, la suite Playwright deve essere eseguita in modo esplicito dopo il provisioning dell’ambiente isolato, non contro dati reali.
