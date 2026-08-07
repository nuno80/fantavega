# Rimozione definitiva delle attivazioni timer legacy

## Cosa cambia

Heartbeat, login, polling della lega e polling degli stati utente aggiornano soltanto la presenza. Non attivano più timer di risposta. L’unico attivatore resta il claim esplicito `response-timer/viewed`, già scoped per utente, lega e asta.

## Perché

Un manager può appartenere a più leghe. Un heartbeat nella Lega A non dimostra che abbia visto un rilancio nella Lega B. Separare presenza e visualizzazione elimina l’attivazione involontaria dopo reconnect, polling o apertura di una lega diversa.

## Verifica

La guardia `scripts/assert-no-legacy-timer-activation.mjs` cerca tutte le chiamate a `activateTimersForUser` nei percorsi applicativi e fallisce se ne trova fuori dal servizio proprietario. Il test Vitest esegue la stessa guardia.

## Compatibilità

Non cambia prezzi, budget, auto-bid, stati dell’asta o acquisizione dei calciatori. Cambia solo il momento in cui parte il timer di risposta: parte quando il client conferma la visualizzazione della risposta corretta.

## Sequenza PR

Questa PR è indipendente da Playwright e va mergiata prima della PR di test browser. Dopo il merge, Playwright può essere corretto e introdotto separatamente senza bloccare il rilascio del fix funzionale.
