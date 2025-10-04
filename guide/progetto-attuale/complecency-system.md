Certamente. Ho integrato le informazioni cruciali dal secondo documento, in particolare la sezione "Gestione delle Penalità" e i nuovi trigger di controllo, per arricchire e dettagliare il documento originale.

Il risultato è un unico file Markdown completo che descrive la funzionalità in modo esaustivo, ideale per essere processato da un LLM o consultato da uno sviluppatore.

---

# Funzionalità: Sistema di Controllo Compliance (Compliance Check)

## 1. Sommario e Obiettivo

Il sistema di **Controllo Compliance** è una funzionalità automatizzata progettata per garantire che tutti i manager di una lega rispettino i requisiti minimi di composizione della rosa, come definiti nelle impostazioni della lega stessa.

L'obiettivo principale è mantenere il gioco equo, penalizzando i manager che non completano la loro rosa entro un tempo stabilito. Il sistema include un periodo di tolleranza ("Grace Period") e applica sanzioni in crediti in modo progressivo e automatico. L'interfaccia utente (UI) fornisce un feedback visivo immediato e in tempo reale sullo stato di conformità di ogni utente.

## 2. Concetti Fondamentali

- **Stato di Compliance**: Un manager è considerato "conforme" (compliant) se la sua rosa soddisfa tutti i requisiti minimi di giocatori per ruolo. È "non conforme" (non-compliant) in caso contrario.
- **Grace Period (Periodo di Tolleranza)**: Quando un manager diventa non conforme, il sistema avvia un timer di **1 ora**. Durante questo periodo, il manager può risolvere la situazione senza subire penalità.
- **Penalità**: Se la non conformità persiste oltre la Grace Period, il sistema inizia ad applicare una penalità di **5 crediti ogni ora**, fino a un massimo di 5 penalità (25 crediti totali) per ciclo di non conformità.

## 3. Architettura del Sistema

Il sistema si basa sull'interazione coordinata di quattro componenti principali:

#### 3.1. Backend (Logica Applicativa)

La logica risiede principalmente nei seguenti file di servizio:

- **File Principale**: `src/lib/db/services/penalty.service.ts`

  - **Funzione Cuore**: `processUserComplianceAndPenalties`
    - Questa funzione centralizzata è il motore dell'intero sistema. Valuta lo stato di conformità di un utente, avvia/ferma il timer, e applica le penalità.

- **File Trigger (Punti di Innesco del Controllo)**:
  - `src/lib/db/services/bid.service.ts`
    - **Funzione `placeInitialBidAndCreateAuction`**: Quando un utente avvia un'asta, guadagna temporaneamente uno "slot". La funzione chiama `processUserComplianceAndPenalties` per verificare se questo lo ha reso conforme.
    - **Funzione `placeBidOnExistingAuction`**: Quando un'offerta di un utente B supera quella di un utente A, l'utente A perde lo "slot" che deteneva. La funzione chiama `processUserComplianceAndPenalties` per l'utente A per verificare se è diventato non conforme.
    - **Funzione `processExpiredAuctionsAndAssignPlayers`**: Al termine di un'asta, viene chiamato `processUserComplianceAndPenalties` per tutti i partecipanti che non hanno vinto, poiché hanno perso lo "slot" su cui stavano puntando.
  - `src/lib/db/services/auction-states.service.ts`
    - **Funzione `handleAuctionAbandon`**: Quando un utente abbandona esplicitamente un'asta, perde uno "slot". La funzione chiama `processUserComplianceAndPenalties` per verificare il suo nuovo stato.

#### 3.2. Database

Il monitoraggio dello stato e la registrazione delle transazioni avvengono tramite tabelle specifiche:

- **Tabella di Stato**: `user_league_compliance_status`

  - **Campo Chiave**: `compliance_timer_start_at`
    - `NULL`: L'utente è **conforme**.
    - `DATETIME (timestamp)`: L'utente è **non conforme**, e il valore indica l'esatto momento in cui è iniziata la Grace Period.

- **Tabella Partecipanti**: `league_participants`

  - **Campo `current_budget`**: Il budget reale e spendibile. Viene ridotto direttamente quando viene applicata una penalità.
  - **Campo `locked_credits`**: I crediti bloccati per gli auto-bid. **Questo campo è indipendente e non viene influenzato dalle penalità.**

- **Tabella Transazioni**: `budget_transactions`
  - Registra tutti i movimenti di budget, incluse le penalità.

#### 3.3. Comunicazione Real-time (WebSocket)

Il backend notifica il frontend istantaneamente:

- **Evento di Stato**: `compliance-status-changed`
  - Emesso ogni volta che lo stato di conformità di un utente cambia.
- **Evento di Notifica**: `penalty-applied-notification`
  - Emesso per informare specificamente un utente che gli è stata applicata una penalità.

#### 3.4. Frontend (Interfaccia Utente)

- **File**: `src/components/auction/AuctionPageContent.tsx`
  - Ascolta l'evento `compliance-status-changed` e aggiorna lo stato dell'applicazione.
- **File**: `src/components/auction/ManagerColumn.tsx`
  - Visualizza gli indicatori di stato (bordo, icone, colori).
- **File**: `src/components/auction/ComplianceTimer.tsx`
  - Mostra il conto alla rovescia della Grace Period.

## 4. Flussi di Lavoro Dettagliati (Scenari)

### Scenario 1: Un Manager diventa NON CONFORME

**Contesto**: Il manager "Alex" viene superato in un'asta per un difensore che gli serviva per raggiungere il minimo richiesto.

1. **Azione Trigger (Backend)**: La funzione `placeBidOnExistingAuction` viene eseguita. Rileva che Alex ha perso la leadership dell'asta e invoca `processUserComplianceAndPenalties` per lui.
2. **Logica di Compliance (Backend)**: `processUserComplianceAndPenalties` rileva che Alex è ora non conforme. Imposta `compliance_timer_start_at` al timestamp corrente nel database.
3. **Notifica Real-time**: Il backend emette l'evento `compliance-status-changed` per Alex.
4. **Aggiornamento UI (Frontend)**: La colonna di Alex diventa **rossa**, appare l'**icona di allerta** e il **timer di 1 ora** parte.

### Scenario 2: Un Manager ritorna CONFORME

**Contesto**: Alex, non conforme, avvia una nuova asta per un altro difensore.

1. **Azione Trigger (Backend)**: La funzione `placeInitialBidAndCreateAuction` viene eseguita e invoca `processUserComplianceAndPenalties` per Alex.
2. **Logica di Compliance (Backend)**: La funzione rileva che Alex è di nuovo conforme. Resetta `compliance_timer_start_at` a `NULL` nel database.
3. **Notifica Real-time**: Il backend emette l'evento `compliance-status-changed`.
4. **Aggiornamento UI (Frontend)**: Il bordo della colonna di Alex torna **verde**, l'icona e il timer scompaiono.

---

## 4.1. Dettaglio del Processo di Applicazione Penalità

Questa sezione descrive cosa accade esattamente quando la Grace Period di 1 ora scade e un utente è ancora non conforme.

**Trigger**: La logica viene innescata da una qualsiasi delle chiamate a `processUserComplianceAndPenalties` (vedi sezione 3.1). La funzione controlla se il campo `compliance_timer_start_at` è antecedente di oltre un'ora rispetto all'ora attuale.

Se la condizione è vera, il sistema esegue le seguenti azioni in una singola transazione atomica:

1. **Calcolo della Penalità**: Viene stabilito l'importo della penalità (es. 5 crediti).

2. **Aggiornamento Budget Utente**:

   - **File**: `src/lib/db/services/penalty.service.ts`
   - **Tabella**: `league_participants`
   - **Azione**: L'importo della penalità viene sottratto direttamente dal campo `current_budget` dell'utente. La logica delle penalità è completamente separata e non interagisce mai con i `locked_credits` (crediti bloccati per gli auto-bid).

3. **Registrazione della Transazione**:

   - **Tabella**: `budget_transactions`
   - **Azione**: Viene inserita una nuova riga per tracciare l'operazione. Questa riga conterrà:
     - `user_id` e `league_id` per identificare l'utente.
     - L'importo della penalità.
     - Un tipo di transazione specifico, come `penalty_requirement`, per indicare la causa della deduzione.

4. **Reset del Timer per la Prossima Penalità**: Il sistema aggiorna `compliance_timer_start_at` all'ora corrente per avviare il ciclo per la penalità successiva (che scatterà dopo un'altra ora, se la non conformità persiste).

5. **Notifica al Frontend**:
   - **Evento**: `penalty-applied-notification`
   - **Azione**: Un evento WebSocket viene inviato al client dell'utente penalizzato.
   - **Effetto UI**: L'utente riceve una notifica "toast" (es. "Penalità di 5 crediti applicata per non conformità della rosa"). Il suo budget visualizzato, che legge direttamente il `current_budget`, si aggiorna immediatamente.

Questo processo garantisce che le penalità siano gestite in modo robusto, tracciabile e con un feedback immediato all'utente, mantenendo una chiara separazione logica tra il budget reale e i crediti impegnati nelle aste.

## 5. Tabella Riassuntiva dei Componenti UI

| Elemento UI               | Stato: Conforme            | Stato: Non Conforme (Grace Period) | Stato: Non Conforme (Penalità Attive)      |
| :------------------------ | :------------------------- | :--------------------------------- | :----------------------------------------- |
| **Bordo Colonna Manager** | Verde (`border-green-500`) | Rosso (`border-red-500`)           | Rosso (`border-red-500`)                   |
| **Icona Compliance**      | Scudo con spunta verde     | Scudo di allerta arancione         | Scudo rosso                                |
| **Timer**                 | Non visibile               | Visibile, con countdown `MM:SS`    | Non visibile (ma ciclo attivo nel backend) |
| **Badge Penalità**        | Non visibile               | Non visibile                       | Visibile (es. "P" rossa con importo)       |
| **Contatori Ruoli**       | Testo verde (es. 4/4)      | Testo rosso (es. 3/4)              | Testo rosso (es. 3/4)                      |
