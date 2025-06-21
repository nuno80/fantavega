# Struttura del Progetto e Funzione dei File Chiave (Logica Applicativa) v.1.1

## 0. Panoramica Funzionale dell'Applicazione (Fantavega)

Fantavega è un sistema di aste online progettato per il gioco del Fantacalcio. L'obiettivo è permettere a un gruppo di utenti (manager) di formare le proprie squadre acquistando calciatori attraverso un meccanismo d'asta competitivo, gestendo un budget limitato e rispettando requisiti di composizione della rosa.

**Flusso Principale e Caratteristiche Chiave:**

1. **Amministrazione della Lega:**

   - Un utente con ruolo "admin" crea una "lega d'asta".
   - L'admin definisce: nome, tipo (classic/mantra), budget iniziale per manager, numero di giocatori per ruolo (`slots_P, D, C, A`), offerta minima (`min_bid`), e durata del timer per le aste dei singoli giocatori (`timer_duration_hours`).
   - L'admin aggiunge i manager partecipanti alla lega. Quando un partecipante viene aggiunto, il suo `current_budget` viene inizializzato e viene creata una transazione di tipo `'initial_allocation'` in `budget_transactions`.
   - L'admin gestisce le fasi dell'asta (es. `setup`, `participants_joining`, `draft_active`, `repair_active`, `market_closed`) e i ruoli attivi per le offerte (`active_auction_roles`).

2. **Fasi dell'Asta e Offerte:**

   - **Inizio Asta Giocatore**: Un'asta per un singolo calciatore (`auctions` record) inizia quando un manager fa la prima offerta valida.
   - **Timer Asta Giocatore**: Con la prima offerta, parte un timer (configurato dalla lega, es. 24 ore). Ogni nuova offerta valida resetta il timer.
   - **Validazione Offerte**: Ogni offerta è validata rispetto a:
     - Stato della lega e ruoli attivi.
     - Offerta minima.
     - **Budget Disponibile del Manager**: Calcolato come `current_budget - locked_credits` dalla tabella `league_participants`.
     - **Slot Disponibili per Ruolo**: Considerando giocatori già assegnati (`player_assignments`) e offerte attive vincenti per lo stesso ruolo.
   - **Gestione `locked_credits`**:
     - Quando un manager fa un'offerta che lo rende il miglior offerente, l'importo viene aggiunto ai suoi `locked_credits`.
     - Se l'offerta viene superata, i `locked_credits` relativi vengono sbloccati (decrementati).
   - **Tipi di Offerta**: Manuale, Quick Bid (+1 o configurabile). (Auto-Bid è futuro).
   - **Conclusione Asta Giocatore**: Alla scadenza del timer (gestita da `processExpiredAuctionsAndAssignPlayers`, triggerato da API admin/futuro CRON):
     - L'ultimo miglior offerente vince. `auctions.status` diventa `sold`.
     - Il `current_budget` del vincitore viene decrementato.
     - I `locked_credits` del vincitore (per quest'asta) vengono decrementati (diventano spesi).
     - Il contatore `players_X_acquired` del vincitore aumenta.
     - Viene creato un record in `player_assignments`.
     - Viene registrata una transazione `'win_auction_debit'` in `budget_transactions`.

3. **Sistema di Penalità per Composizione Rosa (Subtask 5.4 - Approccio "Lazy con Cap"):**

   - **Trigger**: Al login dell'utente o all'accesso a sezioni chiave dell'asta.
   - **Requisito**: Entro 1 ora dal trigger, l'utente deve coprire `N-1` slot per ogni ruolo attivo.
   - **Penalità**: 5 crediti se non conforme dopo 1 ora. Ricorrente ogni ora successiva di non conformità (valutata al trigger successivo), fino a un cap di 5 penalità (25 crediti) per ciclo.
   - **Reset Ciclo**: Se l'utente diventa conforme, il contatore penalità si azzera. Un nuovo ciclo può iniziare se ridiventa non conforme.
   - **Inattività**: Le penalità maturate durante inattività sono applicate retroattivamente al successivo trigger.
   - **Tracciamento**: Tabella `user_league_compliance_status` (proposta).
   - **Effetto**: Deduzione da `current_budget` e registrazione in `budget_transactions` (tipo `penalty_requirement`).

4. **Asta di Riparazione**: (Funzionalità futura) Svincoli e nuove aste.
5. **Ruoli Utente**: Admin e Manager.

Questo documento dettaglia i file che implementano la logica di business.

---

## 1. Middleware di Autenticazione e Autorizzazione

### `src/middleware.ts`

- **Funzione:** Intercetta tutte le richieste per gestire autenticazione e autorizzazione (ruoli "admin", "manager") usando Clerk.
- **Logica Chiave:** Utilizza `clerkMiddleware`, `currentUser()` o `auth()`. Definisce rotte pubbliche, admin, e autenticate. Gestisce redirect e risposte JSON 401/403. Legge ruoli da `publicMetadata.role` (o `sessionClaims.metadata.role` se configurato).
- **Dipendenze:** `@clerk/nextjs/server`, `next/server`.

## 2. Definizioni di Tipo Globali (TypeScript)

### `src/types/globals.d.ts`

- **Funzione:** Estende interfacce globali Clerk (es. `UserPublicMetadata`, `CustomJwtSessionClaims`) per type safety sui ruoli.
- **Logica Chiave:** Definisce `AppRole`.

## 3. Servizi di Backend (Logica di Business)

### `src/lib/db/services/auction-league.service.ts`

- **Funzione:** Logica per la gestione delle leghe d'asta e dei loro partecipanti.
- **Funzioni Implementate Chiave:**
  - `createAuctionLeague`
  - `getAuctionLeaguesByAdmin`
  - `getAuctionLeagueByIdForAdmin`
  - `updateAuctionLeague`
  - `addParticipantToLeague`: Aggiunge un manager, inizializza il `current_budget`, e logga una transazione `'initial_allocation'` in `budget_transactions`.
  - `getLeagueParticipants`
  - `removeParticipantFromLeague` (logica di base implementata).
- **Dipendenze:** `src/lib/db/index.ts`.

### `src/lib/db/services/bid.service.ts` **(AGGIORNATO SIGNIFICATIVAMENTE)**

- **Funzione:** Logica di business per offerte, aste, gestione `locked_credits`, e conclusione aste.
- **Funzioni Implementate Chiave:**
  - `checkSlotsAndBudgetOrThrow`: Valida offerte contro `current_budget - locked_credits` e slot.
  - `placeInitialBidAndCreateAuction`: Gestisce la prima offerta, incrementa `locked_credits` dell'offerente.
  - `placeBidOnExistingAuction`: Gestisce offerte successive, aggiorna `locked_credits` del nuovo e del precedente miglior offerente.
  - `getAuctionStatusForPlayer`: Recupera stato asta.
  - `processExpiredAuctionsAndAssignPlayers`: Processa aste scadute: aggiorna `status` asta, `current_budget` e `locked_credits` del vincitore, `players_X_acquired`, crea `player_assignments`, e logga transazione `'win_auction_debit'`.
- **Dipendenze:** `src/lib/db/index.ts`.

### `src/lib/db/services/budget.service.ts` **(NUOVO)**

- **Funzione:** Logica per recuperare informazioni relative al budget.
- **Funzioni Implementate Chiave:**
  - `getBudgetTransactionHistory`: Recupera la cronologia delle transazioni da `budget_transactions` per un utente in una lega.
- **Dipendenze:** `src/lib/db/index.ts`.

### `src/lib/db/services/penalty.service.ts` **(DA CREARE - per Subtask 5.4)**

- **Funzione Proposta:** Conterrà la logica per il sistema di penalità.
- **Funzioni Proposte:**
  - `processUserComplianceAndPenalties`: Funzione principale chiamata al login/interazione utente per verificare la conformità ai requisiti di rosa (`N-1` slot), applicare penalità orarie (5 crediti, cap 25 per ciclo), e aggiornare la tabella `user_league_compliance_status` (proposta).
- **Dipendenze:** `src/lib/db/index.ts`.

## 4. Handler delle Route API (Next.js App Router)

(Le descrizioni delle route API per la gestione delle leghe e dei partecipanti rimangono simili, ma ora delegano a servizi che gestiscono anche transazioni di budget e `locked_credits`).

### `src/app/api/admin/leagues/route.ts`

- **Funzione:** `POST` crea lega, `GET` lista leghe admin. Delega a `auction-league.service.ts`.

### `src/app/api/admin/leagues/[league-id]/route.ts`

- **Funzione:** `GET` dettagli lega, `PUT` aggiorna lega. Delega a `auction-league.service.ts`.

### `src/app/api/admin/leagues/[league-id]/participants/route.ts`

- **Funzione:** `POST` aggiunge partecipante (triggerando log transazione budget). `GET` lista partecipanti. Delega a `auction-league.service.ts`.

### `src/app/api/admin/leagues/[league-id]/participants/[participant-user-id]/route.ts`

- **Funzione:** `DELETE` rimuove partecipante. Delega a `auction-league.service.ts`.

### `src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts` **(AGGIORNATO)**

- **Funzione:** Gestisce offerte (`POST`) e recupero stato asta (`GET`).

* **Logica `POST`**: Delega alle funzioni in `bid.service.ts` che ora gestiscono `locked_credits` e validano contro il budget disponibile.
* **Autenticazione/Autorizzazione**: Protetta per manager.

### `src/app/api/admin/tasks/process-auctions/route.ts` **(NUOVO)**

- **Funzione:** Endpoint `POST` (solo admin) per triggerare `processExpiredAuctionsAndAssignPlayers`.

### `src/app/api/leagues/[league-id]/budget-history/route.ts` **(NUOVO)**

- **Funzione:** Endpoint `GET` per un manager per recuperare la propria cronologia di transazioni di budget tramite `budget.service.ts`.

### `src/app/api/leagues/[league-id]/check-compliance/route.ts` **(DA CREARE - per Subtask 5.4)**

- **Funzione Proposta:** Endpoint `POST` (o `GET`) chiamato dal frontend (es. al login/accesso area aste) per triggerare `processUserComplianceAndPenalties` dal (futuro) `penalty.service.ts`.

## 5. Configurazione ESLint

### `.eslintrc.json`

- **Funzione:** Configura le regole di linting.
- **Modifiche Rilevanti:** Regole come `check-file/folder-naming-convention` e `@typescript-eslint/no-unused-vars` sono state ammorbidite (`"warn"` o con opzioni `ignorePattern`) per non bloccare la build a causa di convenzioni specifiche di Next.js (segmenti dinamici) o parametri intenzionalmente non usati (marcati con `_`).

---
