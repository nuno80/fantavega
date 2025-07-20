# Logica Definitiva dei Timer in Fantavega

Questo documento descrive la logica e l'implementazione **definitiva** dei timer nel sistema Fantavega. Le informazioni qui contenute sono il risultato di un'analisi diretta del codice sorgente (`response-timer.service.ts`, `bid.service.ts`) e della chiara spiegazione fornita. **Questa è la fonte di verità che annulla e sostituisce ogni documentazione precedente.**

## 1. Panoramica: Il Timer di Risposta Asincrono

Il sistema non utilizza un timer d'asta globale che si resetta (soft-close). Implementa invece un meccanismo più avanzato: un **Timer di Risposta Asincrono e Specifico per Utente**.

L'obiettivo è dare a un utente che è stato superato (specialmente se offline) un tempo di reazione fisso dal momento in cui torna attivo, senza tenere l'intera asta in ostaggio. Se l'utente non reagisce in tempo, viene penalizzato per aver abbandonato l'asta.

## 2. Componenti Architetturali Chiave

Questa sezione elenca tutti i file e le tabelle del database coinvolti nella logica del timer di risposta.

### Backend (Logica Server-Side)

-   **`src/lib/db/services/response-timer.service.ts`**: **Componente Principale**. Contiene tutta la logica per creare, gestire, processare e penalizzare i timer di risposta.
-   **`src/lib/db/services/bid.service.ts`**: **Orchestratore**. Invoca il servizio dei timer (`createResponseTimer`, `markTimerCompleted`) come parte del flusso di un'offerta.
-   **`src/lib/db/services/auction-states.service.ts`**: **Gestore di Stato**. Lavora in tandem con il servizio dei timer per impostare lo stato dell'utente (es. `rilancio_possibile`) e gestire gli abbandoni.
-   **`src/app/api/user/auction-states/route.ts`**: **Endpoint API**. Espone le funzionalità per recuperare lo stato corrente dei timer e delle aste per l'utente loggato, permettendo all'UI di visualizzare i countdown.
-   **`socket-server.ts`** & **`src/lib/socket-emitter.ts`**: **Comunicazione Real-Time**. Utilizzati per inviare notifiche immediate al client quando un timer viene creato o un'asta viene abbandonata.

### Frontend (Visualizzazione Client-Side)

-   **`src/app/auctions/AuctionPageContent.tsx`**: **Componente Principale UI**. Contiene la logica per ricevere gli stati e i timer dal server e visualizzarli.
-   **`src/components/auction/AuctionRealtimeDisplay.tsx`**: Gestisce la ricezione degli eventi Socket.IO e aggiorna i dati dell'asta in tempo reale.
-   **`src/components/auction/ResponseActionModal.tsx`**: Il modal che appare all'utente quando ha un timer attivo, presentandogli le opzioni per rilanciare o abbandonare.
-   **`src/contexts/SocketContext.tsx`**: Fornisce la connessione socket a tutti i componenti che ne hanno bisogno.

### Database (Persistenza Dati)

-   **Tabella `user_auction_response_timers`**: La tabella centrale che memorizza ogni timer attivo, con la sua scadenza e il suo stato (`pending`, `action_taken`, `deadline_missed`).
-   **Tabella `user_auction_cooldowns`**: Memorizza le penalità. Registra quale utente è in "castigo" per quale giocatore e fino a quando.
-   **Tabella `auctions`**: Contiene un campo `user_auction_states` (JSON) che tiene traccia dello stato di ogni utente all'interno di un'asta.

## 3. Flusso Operativo Dettagliato

Ecco il ciclo di vita completo del timer di risposta:

### Fase 1: Creazione del Timer

1. **Scenario**: `UserA` è il miglior offerente per il giocatore "Acerbi". `UserB` piazza un'offerta superiore.
2. **Azione Server**: La funzione `placeBidOnExistingAuction` in `bid.service.ts` viene eseguita.
3. **Innesco**: Dopo aver validato l'offerta di `UserB`, il sistema chiama `createResponseTimer` per `UserA` sull'asta di "Acerbi".
4. **Logica `createResponseTimer`**:
   - Viene creato (o aggiornato se già esistente) un record nella tabella `user_auction_response_timers` per `UserA` e l'asta di "Acerbi".
   - Lo stato del timer è impostato su `'pending'`.
   - Viene calcolata una `response_deadline` (es. 1 ora dal momento della creazione). **Questa scadenza è fissa e non dipende dal login dell'utente.**

### Fase 2: Attivazione del Timer (Al Login/Interazione)

1. **Scenario**: `UserA`, che era stato superato, effettua un nuovo login o accede a una pagina che recupera i suoi stati d'asta (es. `/api/user/auction-states`).
2. **Azione Server**: L'endpoint `/api/user/auction-states/route.ts` invoca la funzione `activateTimersForUser(UserA.id)`.
3. **Logica `activateTimersForUser`**:
   - Il server identifica tutti i timer di risposta per `UserA` che sono in stato `'pending'` e che non hanno ancora una `response_deadline` (cioè `response_deadline IS NULL`).
   - Per ciascuno di questi timer, calcola la `response_deadline` come `ora_corrente + 1 ora`.
   - Aggiorna il database con la nuova scadenza.
   - Invia una notifica Socket.IO (`response-timer-started`) a `UserA` per ogni timer attivato, includendo la `deadline` e il `timeRemaining`.
4. **Visualizzazione Client-Side**: L'interfaccia utente di `UserA` riceve queste notifiche e avvia un **countdown visuale** per ogni timer attivato, mostrando il tempo rimanente per rispondere sull'asta (es. "Acerbi").

### Fase 3: Risoluzione del Timer

Ci sono due possibili esiti:

**Caso A: L'utente agisce in tempo**

1. **Azione**: `UserA` vede il timer e decide di rilanciare su "Acerbi" prima della scadenza.
2. **Logica Server**: Piazzando l'offerta, viene chiamata la funzione `markTimerCompleted` per `UserA` e l'asta di "Acerbi".
3. **Risultato**: Il record del timer in `user_auction_response_timers` viene aggiornato con lo stato `'action_taken'`. Il ciclo si conclude senza penalità. Ora sarà `UserB` ad avere un timer di risposta pendente.

**Caso B: L'utente NON agisce in tempo (Abbandono)**

1. **Scenario**: La `response_deadline` per `UserA` sull'asta di "Acerbi" viene superata.
2. **Processo in Background**: Un processo periodico sul server (es. un cron job o un trigger API) esegue la funzione `processExpiredResponseTimers`.
3. **Logica `processExpiredResponseTimers`**:
   - Identifica tutti i timer con stato `'pending'` la cui `response_deadline` è passata.
   - Per ogni timer scaduto (quello di `UserA`):
     - Lo stato del timer viene aggiornato a `'deadline_missed'`.
     - I crediti che `UserA` aveva bloccato sull'asta vengono sbloccati.
     - Viene creato un record nella tabella `user_auction_cooldowns`.
4. **Penalità (Cooldown)**: `UserA` viene messo in "cooldown" per il giocatore "Acerbi" per un periodo definito (es. 48 ore). Durante questo periodo, la funzione `canUserBidOnPlayer` restituirà `false`, impedendo a `UserA` di fare nuove offerte **solo per quel giocatore**.

## 4. Sintesi Architetturale

L'architettura del timer è:

- **Asincrona e Robusta**: Gestisce utenti offline senza bloccare le aste.
- **Specifica per Utente**: Ogni utente ha i propri timer personali, che non influenzano gli altri partecipanti.
- **Basata su Penalità**: Incentiva la partecipazione attiva e punisce l'abbandono delle aste, mantenendo il mercato fluido.
- **Server-Authoritative**: Tutta la logica critica (creazione, scadenza, penalità) è gestita dal backend, garantendo coerenza e sicurezza. Il client ha solo responsabilità di visualizzazione.
