# Struttura del Progetto e Funzione dei File Chiave (Logica Applicativa)

## 0. Panoramica Funzionale dell'Applicazione (Fantavega)

Fantavega è un sistema di aste online progettato per il gioco del Fantacalcio. L'obiettivo è permettere a un gruppo di utenti (manager) di formare le proprie squadre acquistando calciatori attraverso un meccanismo d'asta competitivo e gestendo un budget limitato.

**Flusso Principale e Caratteristiche Chiave:**

1. **Amministrazione della Lega:**

   - Un utente con ruolo "admin" crea una "lega d'asta" (es. per una stagione calcistica).
   - L'admin definisce le regole della lega: nome, tipo (classic/mantra), budget iniziale per ogni manager, numero di giocatori per ruolo (Portieri, Difensori, Centrocampisti, Attaccanti).
   - L'admin aggiunge i manager partecipanti alla lega, assegnando loro il budget iniziale.

2. **Fasi dell'Asta:**

   - **Asta Iniziale (Draft):**
     - L'admin definisce finestre temporali e i ruoli attivi per le offerte (es. "solo Portieri", poi "solo Difensori", ecc., oppure "tutti i ruoli").
     - Un'asta per un singolo calciatore **inizia quando un manager fa la prima offerta** su un giocatore disponibile (non ancora acquistato in quella lega e il cui ruolo è attualmente "aperto" per le offerte).
     - Con la prima offerta, parte un **timer di 24 ore** per quel specifico calciatore.
     - Ogni nuova offerta valida (superiore alla precedente) **resetta il timer a 24 ore**.
   - **Tipi di Offerta:**
     - **Manuale:** Il manager inserisce un importo specifico.
     - **Quick Bid (+1):** Offerta rapida di 1 credito superiore all'offerta corrente.
     - **Auto-Bid (Rilancio Automatico):** Il manager imposta un'offerta massima. Il sistema rilancerà automaticamente per lui (di 1 credito) fino al raggiungimento del suo massimo, se superato da altri. L'auto-bid funziona anche se l'utente non è online.
   - **Notifiche e Timer di Risposta:**
     - Quando l'offerta di un manager viene superata, al suo successivo login (o tramite notifiche push/email future), viene attivato un **timer di risposta di 1 ora**.
     - Entro quest'ora, il manager deve agire (rilanciare o abbandonare l'asta per quel giocatore).
     - Se non agisce, riceve una penalità (es. -5 crediti) e viene considerato come se avesse abbandonato l'asta per quel giocatore.
   - **Abbandono Asta:** Un manager può scegliere di abbandonare un'asta per un giocatore. Questo disattiva le sue auto-bid per quel giocatore e potrebbe attivare un periodo di "cooldown" prima che possa rientrare nella stessa asta.
   - **Conclusione Asta Giocatore:** L'asta per un giocatore termina quando il timer di 24 ore scade. L'ultimo manager con l'offerta più alta si aggiudica il calciatore. Il suo budget viene decurtato e il giocatore aggiunto alla sua rosa per quella lega.
   - **Conclusione Fase Asta Iniziale:** L'admin chiude manualmente le varie fasi dei ruoli e, infine, l'asta iniziale una volta che i manager hanno (teoricamente) completato le rose.

3. **Asta di Riparazione (Periodo di Mercato Successivo):**

   - Dopo la conclusione dell'asta iniziale (es. a metà stagione calcistica), l'admin può aprire una o più fasi di riparazione.
   - **Svincoli:** I manager possono richiedere di svincolare giocatori dalla propria rosa. L'admin approva/rifiuta queste richieste. Se approvato, il manager recupera una parte del credito (es. la quotazione attuale del giocatore) e il giocatore torna disponibile.
   - **Nuove Aste:** L'admin "apre" il mercato per i giocatori disponibili (svincolati o nuovi). I manager possono fare offerte per questi giocatori per riempire gli slot liberati o migliorare la squadra, seguendo un meccanismo d'asta simile a quello iniziale.

4. **Gestione del Budget:**

   - Ogni manager ha un budget per lega, che diminuisce con ogni acquisto.
   - Le offerte impegnano ("bloccano") una parte del budget disponibile.
   - Il sistema valida la disponibilità di budget prima di accettare un'offerta.

5. **Ruoli Utente:**
   - **Admin:** Gestisce le leghe, i partecipanti, le fasi d'asta, approva svincoli, può intervenire su aste (funzionalità future).
   - **Manager:** Partecipa alle aste, fa offerte, gestisce la propria squadra e budget.

Questo documento dettaglia i file che implementano la logica di business per queste funzionalità.

---

## 1. Middleware di Autenticazione e Autorizzazione

### `src/middleware.ts`

- **Funzione:** Intercetta tutte le richieste all'applicazione (pagine e API) per gestire l'autenticazione e l'autorizzazione basata sui ruoli utilizzando Clerk.
- **Logica Chiave:**
  - Utilizza `clerkMiddleware` e la funzione `auth()` da `@clerk/nextjs/server`.
  - Definisce route pubbliche (accessibili a tutti), route admin (accessibili solo a utenti con ruolo "admin"), e route autenticate generiche.
  - Reindirizza gli utenti non autenticati alla pagina di sign-in per le richieste a pagine HTML protette.
  - Restituisce errori JSON `401 Unauthorized` o `403 Forbidden` per le richieste API non autorizzate.
  - Controlla il ruolo dell'utente accedendo a `sessionClaims.metadata.role` (per sessioni browser standard) e a `sessionClaims.publicMetadata.role` o `sessionClaims['public_metadata'].role` (per token JWT da template usati per test API).
- **Dipendenze:** `@clerk/nextjs/server`, `next/server`.

## 2. Definizioni di Tipo Globali (TypeScript)

### `src/types/globals.d.ts` (o nome simile)

- **Funzione:** Estende le interfacce globali di Clerk (come `CustomJwtSessionClaims` e `UserPublicMetadata`) per fornire a TypeScript informazioni sulla struttura dei dati personalizzati, in particolare i ruoli utente memorizzati nei metadati.
- **Logica Chiave:**
  - Definisce tipi come `AppRole` (es. `"admin" | "manager"`).
  - Estende `CustomJwtSessionClaims` per includere `metadata?: { role?: AppRole; }` e `publicMetadata?: { role?: AppRole; }`.
  - (Opzionale) Estende `UserPublicMetadata` per tipizzare `user.publicMetadata`.
- **Importanza:** Cruciale per la type safety e per evitare errori TypeScript quando si accede a proprietà personalizzate negli oggetti `sessionClaims` o `user` di Clerk.

## 3. Servizi di Backend (Logica di Business)

### `src/lib/db/services/auction-league.service.ts`

- **Funzione:** Contiene la logica di business principale per interagire con il database (tabelle `auction_leagues` e `league_participants`). Separa le operazioni sui dati dagli handler API.
- **Funzioni Implementate (Subtask 4.1):**
  - `createAuctionLeague(data, adminUserId)`: Crea una nuova lega d'asta. Include validazioni sui dati di input e controlla l'unicità del nome della lega.
  - `getAuctionLeaguesByAdmin(adminUserId)`: Recupera tutte leghe create da un specifico admin.
  - `getAuctionLeagueByIdForAdmin(leagueId, adminUserId)`: Recupera una singola lega, verificando che l'admin richiedente sia il creatore.
  - `updateAuctionLeague(leagueId, data, adminUserId)`: Aggiorna una lega esistente. Include validazioni sulla modificabilità dei campi in base allo stato della lega e verifica la proprietà dell'admin.
  - `addParticipantToLeague(leagueId, userIdToAdd, adminUserId)`: Aggiunge un utente (manager) come partecipante a una lega. Include validazioni (esistenza utente, ruolo manager, non già partecipante, proprietà lega).
  - `getLeagueParticipants(leagueId)`: Recupera tutti i partecipanti di una lega, unendo i dati con la tabella utenti per ottenere dettagli come username e nome completo.
  - `removeParticipantFromLeague(leagueId, userIdToRemove, adminUserId)`: Rimuove un partecipante da una lega. Include validazioni di base e un avviso per la rimozione da leghe attive.
- **Dipendenze:** `src/lib/db/index.ts` (per l'oggetto `db` di BetterSQLite3).

## 4. Handler delle Route API (Next.js App Router)

Questi file definiscono gli endpoint HTTP e gestiscono le richieste e le risposte, delegando la logica di business ai servizi.

### `src/app/api/admin/leagues/route.ts`

- **Funzione:** Gestisce le richieste per la risorsa "collezione di leghe".
- **Endpoint Implementati:**
  - `POST /api/admin/leagues`:
    - Riceve i dati per una nuova lega.
    - Esegue validazioni iniziali sul corpo della richiesta.
    - Chiama `createAuctionLeague` nel servizio.
    - Restituisce la lega creata (201) o un errore (400, 500).
  - `GET /api/admin/leagues`:
    - Chiama `getAuctionLeaguesByAdmin` nel servizio.
    - Restituisce un array di leghe (200) o un errore.
- **Autenticazione/Autorizzazione:** Protetta dal middleware; inoltre, ogni handler verifica che l'utente sia un admin tramite `currentUser().publicMetadata.role`.

### `src/app/api/admin/leagues/[league-id]/route.ts`

- **Funzione:** Gestisce le richieste per una singola lega specifica, identificata da `league-id`.
- **Endpoint Implementati:**
  - `GET /api/admin/leagues/{leagueId}`:
    - Estrae `leagueId` dai parametri.
    - Chiama `getAuctionLeagueByIdForAdmin` nel servizio.
    - Restituisce i dettagli della lega (200), un errore 404 se non trovata/non posseduta, o 500.
  - `PUT /api/admin/leagues/{leagueId}`:
    - Estrae `leagueId` e il corpo della richiesta.
    - Esegue validazioni sul corpo.
    - Chiama `updateAuctionLeague` nel servizio.
    - Restituisce la lega aggiornata (200) o un errore (400, 404, 500).
- **Autenticazione/Autorizzazione:** Come sopra.
- **Gestione Parametri:** Utilizza la struttura `context: { params: Promise<{ "league-id": string }> }` e `await context.params` per accedere ai parametri di rotta asincroni.

### `src/app/api/admin/leagues/[league-id]/participants/route.ts`

- **Funzione:** Gestisce le richieste per la risorsa "collezione di partecipanti" all'interno di una specifica lega.
- **Endpoint Implementati:**
  - `POST /api/admin/leagues/{leagueId}/participants`:
    - Estrae `leagueId` e `userIdToAdd` (dal corpo).
    - Chiama `addParticipantToLeague` nel servizio.
    - Restituisce il partecipante aggiunto (201) o un errore.
  - `GET /api/admin/leagues/{leagueId}/participants`:
    - Estrae `leagueId`.
    - Chiama `getLeagueParticipants` nel servizio.
    - Restituisce un array di partecipanti (200) o un errore.
- **Autenticazione/Autorizzazione:** Come sopra.
- **Gestione Parametri:** Simile a `/[league-id]/route.ts` per `league-id`.

### `src/app/api/admin/leagues/[league-id]/participants/[participant-user-id]/route.ts`

- **Funzione:** Gestisce le richieste per un singolo partecipante specifico all'interno di una lega.
- **Endpoint Implementati:**
  - `DELETE /api/admin/leagues/{leagueId}/participants/{participantUserId}`:
    - Estrae `leagueId` e `participantUserId`.
    - Chiama `removeParticipantFromLeague` nel servizio.
    - Restituisce un messaggio di successo (200) o un errore.
- **Autenticazione/Autorizzazione:** Come sopra.
- **Gestione Parametri:** Utilizza `context: { params: Promise<{ "league-id": string; "participant-user-id": string }> }` e `await context.params`.

## 5. Configurazione ESLint

### `.eslintrc.json`

- **Funzione:** Configura le regole di linting per il progetto.
- **Modifiche Rilevanti (per sbloccare la build):**
  - La regola `check-file/folder-naming-convention` è stata temporaneamente impostata su `"warn"` per permettere l'uso di nomi di cartelle per segmenti dinamici (es. `[league-id]`) che non aderiscono strettamente al `KEBAB_CASE` atteso dal plugin senza configurazioni di ignore specifiche.
  - La regola `@typescript-eslint/no-unused-vars` è stata configurata con `argsIgnorePattern: "^_"` e `varsIgnorePattern: "^_"` per permettere l'uso di underscore per marcare parametri e variabili intenzionalmente non usati.

---
