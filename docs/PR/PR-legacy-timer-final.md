# Timer legacy, visualizzazione e isolamento multi-lega

## Stato

Questa PR collega il claim atomico già introdotto alla UI reale: il countdown viene richiesto quando il modal di risposta è aperto, usando lega e giocatore. Il server risolve l’asta attiva nella lega e limita il claim alla combinazione corretta.

## Scenario coperto

Lo stesso manager può avere aste pendenti nella Lega A e nella Lega B. Aprire il modal della Lega A attiva solo il timer A. Il timer B resta pendente. Due aperture simultanee attivano una sola volta e inviano una sola notifica.

## Disconnessioni

La disconnessione Socket, il reconnect e l’heartbeat non chiamano il nuovo endpoint. Il claim richiede una richiesta esplicita dal componente che presenta il modal, quindi la perdita della connessione non può attivare un timer.

## Nota di dipendenza

La PR #34 ha già introdotto il servizio di claim e il report server-side. Questa PR è dipendente concettualmente da quel contratto e completa il collegamento frontend. Le vecchie chiamate server-side a `activateTimersForUser` devono essere rimosse o rese non operative nello stesso rollout per eliminare del tutto il comportamento legacy del polling.

## Test

Il test E2E copre due leghe indipendenti e due richieste concorrenti sullo stesso timer. Restano da eseguire i check GitHub e un test manuale con due tab dello stesso utente.
