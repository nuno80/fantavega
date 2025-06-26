# Struttura del Progetto e Funzione dei File Chiave (Logica Applicativa) v.1.2

## 0. Panoramica Funzionale dell'Applicazione (Fantavega)

Fantavega è un sistema di aste online progettato per il gioco del Fantacalcio. L'obiettivo è permettere a un gruppo di utenti (manager) di formare le proprie squadre acquistando calciatori attraverso un meccanismo d'asta competitivo, gestendo un budget limitato e rispettando requisiti di composizione della rosa.

**Flusso Principale e Caratteristiche Chiave:**

1.  **Amministrazione della Lega:**
    *   Un utente con ruolo "admin" crea una "lega d'asta".
    *   L'admin definisce: nome, tipo, budget iniziale per manager, numero di giocatori per ruolo (`slots_P, D, C, A`), offerta minima (`min_bid`), e durata del timer per le aste dei singoli giocatori (`timer_duration_hours`).
    *   L'admin aggiunge i manager partecipanti alla lega, assegnando loro un nome squadra (`manager_team_name`). Quando un partecipante viene aggiunto, il suo `current_budget` viene inizializzato e viene creata una transazione di tipo `'initial_allocation'`.
    *   L'admin gestisce le fasi dell'asta (es. `setup`, `participants_joining`, `draft_active`) e i ruoli attivi per le offerte.

2.  **Fasi dell'Asta e Offerte:**
    *   **Inizio Asta Giocatore**: Un'asta per un singolo calciatore (`auctions` record) inizia quando un manager fa la prima offerta valida.
    *   **Timer Asta Giocatore**: Con la prima offerta, parte un timer (es. 24 ore). Ogni nuova offerta valida resetta il timer.
    *   **Validazione Offerte**: Ogni offerta è validata rispetto a:
        *   Stato della lega e ruoli attivi.
        *   Offerta minima.
        *   **Budget Disponibile del Manager**: Calcolato come `current_budget - locked_credits`.
        *   **Slot Disponibili per Ruolo**: Considerando giocatori già assegnati e offerte attive vincenti.
    *   **Gestione `locked_credits`**: L'importo dell'offerta vincente di un manager viene aggiunto ai suoi `locked_credits`. Se l'offerta viene superata, i crediti vengono sbloccati.
    *   **Conclusione Asta Giocatore**: Alla scadenza del timer, il vincitore si aggiudica il giocatore. Il suo `current_budget` e `locked_credits` vengono aggiornati, il contatore `players_X_acquired` aumenta, e viene registrata una transazione `'win_auction_debit'`.

3.  **Gestione Dati Giocatori:**
    *   L'admin può importare/aggiornare la lista completa dei giocatori tramite l'upload di un file Excel.
    *   Sono disponibili API per la ricerca/filtro dei giocatori e per la gestione manuale (CRUD) da parte dell'admin.
    *   L'admin può esportare le rose complete di una lega in formato CSV.

4.  **Sistema di Penalità per Composizione Rosa (Approccio "Lazy con Cap"):**
    *   **Trigger**: Al login dell'utente o all'accesso a sezioni chiave dell'asta.
    *   **Requisito**: Entro 1 ora dal trigger, l'utente deve coprire `N-1` slot per ogni ruolo attivo.
    *   **Penalità**: 5 crediti se non conforme dopo 1 ora. Ricorrente ogni ora successiva di non conformità (valutata al trigger successivo), fino a un cap di 5 penalità (25 crediti) per ciclo.
    *   **Reset Ciclo**: Se l'utente diventa conforme, il contatore penalità si azzera. Un nuovo ciclo può iniziare se ridiventa non conforme.

5.  **Ruoli Utente**: Admin e Manager.

Questo documento dettaglia i file che implementano la logica di business.

---

## 1. Middleware di Autenticazione e Autorizzazione

### `src/middleware.ts`

-   **Funzione:** Intercetta tutte le richieste per gestire autenticazione e autorizzazione (ruoli "admin", "manager") usando Clerk.
-   **Logica Chiave:** Utilizza `clerkMiddleware`, `currentUser()` o `auth()`. Definisce rotte pubbliche, admin, e autenticate.

## 2. Definizioni di Tipo Globali (TypeScript)

### `src/types/globals.d.ts`

-   **Funzione:** Estende interfacce globali Clerk (es. `UserPublicMetadata`) per type safety sui ruoli.

## 3. Servizi di Backend (Logica di Business)

### `src/lib/db/services/auction-league.service.ts`

-   **Funzione:** Gestione leghe e partecipanti.
-   **Funzioni Implementate Chiave:** `createAuctionLeague`, `getAuctionLeaguesByAdmin`, `getAuctionLeagueByIdForAdmin`, `updateAuctionLeague`, `addParticipantToLeague` (con log transazione), `getLeagueParticipants`, `removeParticipantFromLeague`, `getManagerRoster`, `getPlayerAssignmentStatus`, `getLeagueRostersForCsvExport`.

### `src/lib/db/services/bid.service.ts`

-   **Funzione:** Logica core per offerte, aste, `locked_credits`, e conclusione aste.
-   **Funzioni Implementate Chiave:** `checkSlotsAndBudgetOrThrow` (usa `current_budget - locked_credits`), `placeInitialBidAndCreateAuction` (gestisce `locked_credits`), `placeBidOnExistingAuction` (gestisce `locked_credits`), `getAuctionStatusForPlayer`, `processExpiredAuctionsAndAssignPlayers`.

### `src/lib/db/services/budget.service.ts`

-   **Funzione:** Logica per recuperare informazioni relative al budget.
-   **Funzioni Implementate Chiave:** `getBudgetTransactionHistory`.

### `src/lib/db/services/player.service.ts`

-   **Funzione:** Gestione dati giocatori (CRUD, ricerca/filtro).
-   **Funzioni Implementate Chiave:** `getPlayers` (con filtri, ordinamento, paginazione), `createPlayer`, `updatePlayer`, `deletePlayer`.

### `src/lib/services/player-import.service.ts`

-   **Funzione:** Logica per parsare file Excel e fare l'UPSERT dei giocatori nel database.
-   **Funzioni Implementate Chiave:** `processPlayersExcel`.

### `src/lib/db/services/penalty.service.ts` **(DA CREARE)**

-   **Funzione Proposta:** Logica per sistema di penalità (`processUserComplianceAndPenalties`).

## 4. Handler delle Route API (Next.js App Router)

### `src/app/api/admin/leagues/...`
-   Route per la gestione delle leghe e dei partecipanti da parte dell'admin.

### `src/app/api/leagues/[league-id]/...`
-   Route per le interazioni dei manager con la lega, come fare offerte, vedere la cronologia budget, vedere le rose.

### `src/app/api/admin/players/...`
-   Route per la gestione dei giocatori da parte dell'admin (CRUD, upload Excel).

### `src/app/api/players/route.ts`
-   Route pubblica per la ricerca e il filtraggio dei giocatori.

### `src/app/api/admin/tasks/...`
-   Route per task amministrativi come processare le aste scadute.

### `src/app/api/admin/leagues/[league-id]/rosters/export/csv/route.ts`
-   Route per l'esportazione CSV delle rose.

### `src/app/api/leagues/[league-id]/check-compliance/route.ts` **(DA CREARE)**
-   Route per triggerare il controllo di conformità per le penalità.

## 5. Configurazione ESLint

### `.eslintrc.json`

- **Funzione:** Configura le regole di linting.
- **Modifiche Rilevanti:** Regole come `check-file/folder-naming-convention` e `@typescript-eslint/no-unused-vars` sono state ammorbidite (`"warn"` o con opzioni `ignorePattern`) per non bloccare la build a causa di convenzioni specifiche di Next.js (segmenti dinamici) o parametri intenzionalmente non usati (marcati con `_`).

---
