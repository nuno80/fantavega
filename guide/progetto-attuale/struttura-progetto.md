# Struttura del Progetto e Funzione dei File Chiave (Logica Applicativa)

## 0. Panoramica Funzionale dell'Applicazione (Fantavega)

Fantavega è un sistema di aste online progettato per il gioco del Fantacalcio. L'obiettivo è permettere a un gruppo di utenti (manager) di formare le proprie squadre acquistando calciatori attraverso un meccanismo d'asta competitivo e gestendo un budget limitato.

**Flusso Principale e Caratteristiche Chiave:**

1. **Amministrazione della Lega:**

   - Un utente con ruolo "admin" crea una "lega d'asta".
   - L'admin definisce: nome, tipo (classic/mantra), budget iniziale, numero di giocatori per ruolo, offerta minima (`min_bid`), e durata del timer per le aste (`timer_duration_hours`).
   - L'admin aggiunge i manager partecipanti alla lega.

2. **Fasi dell'Asta:**

   - **Asta Iniziale (Draft):**
     - L'admin imposta lo stato della lega (es. `draft_active`), definisce finestre temporali e i ruoli attivi per le offerte (`active_auction_roles`).
     - Un'asta per un singolo calciatore **inizia quando un manager fa la prima offerta** su un giocatore disponibile (non ancora acquistato, ruolo attivo, budget e slot permettendo). Questa azione crea un record nella tabella `auctions`.
     - Con la prima offerta, parte un **timer** (configurato dalla lega, es. 24 ore) per quel calciatore.
     - Ogni nuova offerta valida (superiore alla precedente, da un manager diverso o lo stesso se non è il migliore, con budget/slot disponibili) **resetta il timer**.
   - **Tipi di Offerta:**
     - **Manuale:** Importo specifico.
     - **Quick Bid (+N):** Offerta rapida di N crediti (es. +1) superiore all'offerta corrente. (Logica di N da definire, per ora +1).
     - **Auto-Bid (Rilancio Automatico):** (Funzionalità futura) Manager imposta un massimo, sistema rilancia.
   - **Notifiche e Timer di Risposta:** (Funzionalità futura) Avvisi per offerte superate, con timer per reagire.
   - **Conclusione Asta Giocatore:** L'asta termina alla scadenza del timer. L'ultimo miglior offerente si aggiudica il giocatore. Il budget viene aggiornato e il giocatore assegnato (`player_assignments`).
   - **Conclusione Fase Asta Iniziale:** L'admin chiude manualmente le fasi.

3. **Asta di Riparazione:** (Funzionalità futura) Svincoli e nuove aste.
4. **Gestione del Budget:** Budget individuale per lega, validazioni sulle offerte.
5. **Ruoli Utente:** Admin e Manager.

Questo documento dettaglia i file che implementano la logica di business.

---

## 1. Middleware di Autenticazione e Autorizzazione

### `src/middleware.ts`

- **Funzione:** Intercetta tutte le richieste per gestire autenticazione e autorizzazione (ruoli "admin", "manager") usando Clerk.
- **Logica Chiave:** Utilizza `clerkMiddleware`, `auth()`. Definisce rotte pubbliche, admin, e autenticate. Gestisce redirect e risposte JSON 401/403. Legge ruoli da `sessionClaims.metadata.role` (sessioni browser) e `sessionClaims.publicMetadata.role` o `sessionClaims['public_metadata'].role` (token JWT).
- **Dipendenze:** `@clerk/nextjs/server`, `next/server`.

## 2. Definizioni di Tipo Globali (TypeScript)

### `src/types/globals.d.ts`

- **Funzione:** Estende interfacce globali Clerk (`CustomJwtSessionClaims`, `UserPublicMetadata`) per type safety sui ruoli e altri metadati personalizzati.
- **Logica Chiave:** Definisce `AppRole`. Estende `CustomJwtSessionClaims` con `metadata?: { role?: AppRole; }` e `publicMetadata?: { role?: AppRole; }`.

## 3. Servizi di Backend (Logica di Business)

### `src/lib/db/services/auction-league.service.ts`

- **Funzione:** Logica per la gestione delle leghe d'asta e dei loro partecipanti.
- **Funzioni Implementate:**
  - `createAuctionLeague`: Crea una nuova lega.
  - `getAuctionLeaguesByAdmin`: Lista leghe di un admin.
  - `getAuctionLeagueByIdForAdmin`: Dettagli di una lega (con controllo proprietà admin).
  - `updateAuctionLeague`: Aggiorna una lega (con validazioni su stato e proprietà).
  - `addParticipantToLeague`: Aggiunge un manager a una lega.
  - `getLeagueParticipants`: Lista i partecipanti di una lega (con info utente).
  - `removeParticipantFromLeague`: Rimuove un manager da una lega.
- **Dipendenze:** `src/lib/db/index.ts`.

### `src/lib/db/services/bid.service.ts` **(NUOVO/AGGIORNATO)**

- **Funzione:** Contiene la logica di business per la gestione delle offerte e delle aste dei singoli giocatori.
- **Interfacce Definite:** `LeagueForBidding`, `PlayerForBidding`, `ParticipantForBidding`, `BidRecord`, `AuctionStatusDetails`, `AuctionCreationResult`, `ExistingAuctionBidResult`.
- **Funzioni Implementate (Task 4.2 iniziato):**
  - `checkSlotsAndBudgetOrThrow`: Funzione helper interna per validare budget e disponibilità di slot (logica restrittiva che considera giocatori assegnati e offerte attive vincenti).
  - `placeInitialBidAndCreateAuction(leagueId, playerId, bidderUserId, bidAmount)`: Gestisce la prima offerta per un giocatore. Se le validazioni (stato lega, ruolo attivo, giocatore non assegnato/senza asta attiva, budget, slot) passano, crea un nuovo record in `auctions` e uno in `bids`.
  - `placeBidOnExistingAuction(auctionId, bidderUserId, bidAmount, bidType)`: Gestisce offerte successive su un'asta esistente. Include validazioni (asta attiva, offerta > attuale, non già miglior offerente, budget, slot, ruolo attivo). Aggiorna `auctions` e inserisce in `bids`. Resetta il timer dell'asta.
  - `getAuctionStatusForPlayer(leagueId, playerId)`: Recupera lo stato corrente dell'asta per un giocatore in una lega, includendo dettagli del giocatore, ultimo offerente e cronologia delle ultime offerte.
- **Dipendenze:** `src/lib/db/index.ts`.

## 4. Handler delle Route API (Next.js App Router)

### `src/app/api/admin/leagues/route.ts`

- **Funzione:** Gestisce `POST /api/admin/leagues` (crea lega) e `GET /api/admin/leagues` (lista leghe admin).
- **Delega a:** `auction-league.service.ts`.

### `src/app/api/admin/leagues/[league-id]/route.ts`

- **Funzione:** Gestisce `GET /api/admin/leagues/{id}` (dettagli lega) e `PUT /api/admin/leagues/{id}` (aggiorna lega).
- **Delega a:** `auction-league.service.ts`.
- **Gestione Parametri:** Usa `context: { params: Promise<{ "league-id": string }> }`.

### `src/app/api/admin/leagues/[league-id]/participants/route.ts`

- **Funzione:** Gestisce `POST /api/admin/leagues/{id}/participants` (aggiungi partecipante) e `GET /api/admin/leagues/{id}/participants` (lista partecipanti).
- **Delega a:** `auction-league.service.ts`.
- **Gestione Parametri:** Come sopra per `league-id`.

### `src/app/api/admin/leagues/[league-id]/participants/[participant-user-id]/route.ts`

- **Funzione:** Gestisce `DELETE /api/admin/leagues/{id}/participants/{userId}` (rimuovi partecipante).
- **Delega a:** `auction-league.service.ts`.
- **Gestione Parametri:** Usa `context: { params: Promise<{ "league-id": string; "participant-user-id": string }> }`.

### `src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts` **(NUOVO/AGGIORNATO)**

- **Funzione:** Gestisce le richieste di offerta da parte dei manager e il recupero dello stato di un'asta.
- **Endpoint Implementati:**
  - `POST /api/leagues/{leagueId}/players/{playerId}/bids`:
    - Riceve l'offerta (`amount`, `bid_type`) da un manager autenticato.
    - Chiama `getAuctionStatusForPlayer` per verificare se esiste un'asta attiva.
    - Se non esiste asta attiva, chiama `placeInitialBidAndCreateAuction` per creare l'asta con la prima offerta.
    - Se esiste asta attiva, chiama `placeBidOnExistingAuction` per piazzare un'offerta successiva.
    - Restituisce i dettagli dell'asta creata/aggiornata (201 o 200) o un errore (400, 401, 403, 404, 409, 500).
  - `GET /api/leagues/{leagueId}/players/{playerId}/bids`:
    - Chiama `getAuctionStatusForPlayer` nel servizio.
    - Restituisce i dettagli completi dell'asta per quel giocatore (200), o 404 se non trovata.
- **Autenticazione/Autorizzazione:** Protetta dal middleware per utenti autenticati (manager).
- **Gestione Parametri:** Usa `context: { params: Promise<{ "league-id": string; "player-id": string }> }`.
- **Delega a:** `bid.service.ts`.

## 5. Configurazione ESLint

### `.eslintrc.json`

- **Funzione:** Configura le regole di linting.
- **Modifiche Rilevanti:** Regole come `check-file/folder-naming-convention` e `@typescript-eslint/no-unused-vars` sono state ammorbidite (`"warn"` o con opzioni `ignorePattern`) per non bloccare la build a causa di convenzioni specifiche di Next.js (segmenti dinamici) o parametri intenzionalmente non usati (marcati con `_`).

---
