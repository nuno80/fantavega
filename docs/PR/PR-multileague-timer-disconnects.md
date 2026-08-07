# Timer multi-lega e disconnessioni

## Obiettivo

Il timer di risposta non deve partire perché l’utente è online, ha fatto heartbeat, ha riconnesso Socket.IO o ha aperto una lega diversa. Deve partire solo dopo la conferma della UI per la specifica combinazione `user + league + auction`.

## Modifica introdotta

È stato aggiunto un endpoint dedicato `POST /api/leagues/:leagueId/auctions/:auctionId/response-timer/viewed`. L’update è compare-and-set e contiene una verifica SQL della lega e dello stato dell’asta. Una richiesta concorrente può attivare il timer una sola volta; la notifica Socket viene inviata solo al vincitore del claim.

## Nota di rollout

Questo PR introduce il confine server-side e i test concorrenti. Il client deve chiamare l’endpoint dopo che il modal/stato di risposta è effettivamente montato, non durante il polling di presenza. La rimozione delle chiamate legacy `activateTimersForUser` dal polling va fatta nello stesso rollout frontend prima di considerare completata la migrazione.

## Disconnessioni

La disconnessione non chiama questo endpoint e quindi non può attivare timer. Il logout ritardato continua a usare il timestamp `notAfter`, mentre l’heartbeat resta solo un segnale di presenza.

## Verifiche

- isolamento della lega nella query di claim;
- claim singolo sotto tre richieste concorrenti;
- una sola notifica Socket;
- richiesta su lega diversa non autorizza l’asta.

## Follow-up obbligatorio

Rimuovere `activateTimersForUser` da `recordUserLogin`, dai due endpoint di stato asta e da `getUserAuctionStates`; sostituirlo con chiamate client all’endpoint `viewed`. Senza questo follow-up il comportamento legacy resta attivo e il sistema non è ancora completamente migrato al modello “viewed-only”.
