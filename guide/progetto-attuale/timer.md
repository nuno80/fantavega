# Piano di Implementazione: Sistema di Compliance Event-Driven

Questo documento descrive i task necessari per implementare il sistema di gestione del timer di compliance con un'architettura event-driven, come discusso e approvato.

---

## Fase 1: Backend - Logica Event-Driven

L'obiettivo è spostare tutta la logica di calcolo e aggiornamento dello stato di compliance sul backend, in risposta a eventi specifici.

### Task 1.1: Creare/Potenziare il Servizio di Compliance (`penalty.service.ts`)

1. **Creare una Funzione Riutilizzabile `checkAndRecordCompliance`**:
   - **Input**: `(userId: string, leagueId: number)`
   - **Logica**:
     1. Recupera i requisiti di rosa dalla tabella `auction_leagues`.
     2. Recupera il numero di giocatori acquisiti per ruolo per l'utente da `league_participants`.
     3. Calcola se l'utente è conforme (`isCompliant`).
     4. Recupera lo stato di compliance attuale da `user_league_compliance_status`.
     5. **Applica la logica di stato**:
        - **Caso A: Utente diventa Conforme**: Se `isCompliant` è `true` e la tabella riportava un timer attivo (`compliance_timer_start_at IS NOT NULL`), aggiorna la riga impostando `compliance_timer_start_at = NULL` e azzerando `penalties_applied_this_cycle`.
        - **Caso B: Utente diventa Non Conforme**: Se `isCompliant` è `false` e la tabella non riportava un timer attivo (`compliance_timer_start_at IS NULL`), aggiorna la riga impostando `compliance_timer_start_at = strftime('%s', 'now')`.
        - **Nessun Cambiamento**: Se lo stato di conformità non è cambiato, non eseguire alcuna operazione sul DB.
   - **File**: `src/lib/db/services/penalty.service.ts`

### Task 1.2: Agganciarsi all'Evento "Modifica Rosa"

1. **Modificare `bid.service.ts`**:
   - Individuare la funzione `processExpiredAuctionsAndAssignPlayers`.
   - All'interno del blocco `db.transaction()`, subito dopo l'`INSERT` nella tabella `player_assignments`.
   - Aggiungere una chiamata alla nuova funzione: `checkAndRecordCompliance(auction.current_highest_bidder_id, auction.auction_league_id)`.
   - **File**: `src/lib/db/services/bid.service.ts`

### Task 1.3: Agganciarsi all'Evento "Login Utente"

1. **Configurare un Webhook in Clerk**:
   - Nel pannello di controllo di Clerk, creare un nuovo webhook che ascolti l'evento `user.signedIn`.
   - L'URL dell'endpoint del webhook punterà alla nostra nuova API route.
2. **Creare l'API Route per il Webhook**:
   - **Path**: `src/app/api/webhooks/clerk/route.ts`
   - **Logica**:
     - Implementare la verifica della firma del webhook per sicurezza.
     - Leggere il payload dell'evento. Se il tipo è `user.signedIn`, estrarre l'`id` dell'utente.
     - Per l'utente loggato, recuperare tutte le leghe a cui partecipa.
     - Per ogni lega, chiamare `checkAndRecordCompliance(userId, leagueId)`.

---

## Fase 2: Frontend - Visualizzazione dello Stato

Il frontend diventa un "dumb client": non calcola nulla, si limita a visualizzare lo stato deciso dal backend.

### Task 2.1: Creare il Componente `ComplianceTimer.tsx`

1. **Creare il file**: `src/components/auction/ComplianceTimer.tsx`.
2. **Logica**:
   - Componente client (`'use client'`).
   - **Props**: Accetta `timerStartTimestamp: number | null`.
   - Se la prop è `null`, non renderizza nulla.
   - Se riceve un timestamp, usa `useEffect` e `setInterval` per calcolare e mostrare un countdown di 1 ora (`3600 - (now - timerStartTimestamp)`).
   - Visualizza il tempo rimanente nel formato `MM:SS`.

### Task 2.2: Ottimizzare il Caricamento Dati

1. **Creare una API Route "Bulk"**:
   - **Path**: `src/app/api/leagues/[leagueId]/all-compliance-status/route.ts`
   - **Logica**:
     - Esegue una singola `SELECT` su `user_league_compliance_status` per la `leagueId` data.
     - Restituisce un array di oggetti: `[{ userId, complianceTimerStartAt, ... }]`.

### Task 2.3: Integrare il Timer nella UI

1. **Modificare il Componente Principale dell'Asta**:
   - Il componente che renderizza la pagina dell'asta (es. `AuctionPageContent.tsx`) deve chiamare la nuova API bulk (`/api/leagues/[leagueId]/all-compliance-status/`) una sola volta al caricamento.
2. **Propagare i Dati**:
   - I dati di compliance vengono passati tramite props al componente `ManagerColumn.tsx`.
3. **Visualizzare il Timer**:
   - `ManagerColumn.tsx` riceve i dati per uno specifico manager.
   - Renderizza il componente `<ComplianceTimer />`, passandogli la prop `timerStartTimestamp` corretta per quel manager.
   - Posizionare il timer accanto all'icona di compliance usando Flexbox.

---

## Fase 3: Database

- **Nessuna Modifica Necessaria**: Lo schema attuale, in particolare la tabella `user_league_compliance_status`, è già adeguato per supportare questa nuova logica.
