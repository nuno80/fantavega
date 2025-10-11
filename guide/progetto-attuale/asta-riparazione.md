# Funzionalità: Gestione Svincoli in Fase di Riparazione (`repair_active`)

## 1. Scopo della Funzionalità

L'obiettivo è implementare una fase di mercato speciale, denominata "Riparazione", che si attiva quando un admin imposta lo stato della lega su `repair_active`. Durante questa fase, il normale svolgimento delle aste è bloccato. I manager hanno invece la possibilità di svincolare i giocatori dalle proprie rose per recuperare crediti, preparandosi per la successiva sessione di mercato (es. un'asta di riparazione vera e propria).

### Requisiti Utente

1. **Blocco Totale delle Aste**: Nessun giocatore può essere chiamato e non è possibile fare offerte.
2. **Interfaccia di Svincolo**: Accanto a ogni giocatore nella rosa di un manager, deve comparire un'icona (es. un cestino) per avviare il processo di svincolo.
3. **Restituzione Crediti**: Svincolando un giocatore, il manager riceve un ammontare di crediti pari alla **quotazione attuale** del giocatore (non al prezzo di acquisto). La transazione deve essere tracciata.
4. **Vincolo di Proprietà**: Ogni manager può svincolare esclusivamente i giocatori appartenenti alla propria squadra.

## 2. Piano di Azione Dettagliato

Per implementare questa funzionalità in modo sicuro, seguiremo un approccio incrementale, partendo dalla disattivazione della logica corrente fino all'implementazione della nuova UI.

---

### Fase 1: Disattivazione della Logica d'Asta Esistente per `repair_active`

**Obiettivo**: Allineare il comportamento del sistema al requisito #1, assicurando che durante la fase `repair_active` non si possano avviare aste o piazzare offerte.

- **Azione 1.1**: Modificare `src/lib/db/services/bid.service.ts`.

  - **Localizzare**: La condizione `if (league.status !== "draft_active" && league.status !== "repair_active")`.
  - **Modificare**: Rimuovere `&& league.status !== "repair_active"`. La nuova condizione sarà `if (league.status !== "draft_active")`. In questo modo, le offerte saranno permesse solo durante il draft principale.

- **Azione 1.2**: Modificare `src/app/api/leagues/[league-id]/start-auction/route.ts`.

  - **Localizzare**: La condizione `if (league.status !== "draft_active" && league.status !== "repair_active")`.
  - **Modificare**: Rimuovere `&& league.status !== "repair_active"`. Questo impedirà di chiamare nuovi giocatori in `repair_active`.

- **Azione 1.3 (Verifica)**: Analizzare `src/lib/db/services/penalty.service.ts`.
  - **Confermare**: La logica attuale `!["draft_active", "repair_active"].includes(league.status)` sospende correttamente le penalità durante la fase di riparazione. Questo comportamento è desiderabile e va mantenuto.

---

### Fase 2: Implementazione Logica di Svincolo Giocatori (Backend)

**Obiettivo**: Creare l'infrastruttura backend per gestire in modo sicuro lo svincolo di un giocatore.

- **Azione 2.1**: Creare un nuovo endpoint API per lo svincolo.

  - **File**: `src/app/api/leagues/[league-id]/roster/[player-id]/route.ts`.
  - **Metodo**: Implementare la funzione `DELETE`.
  - **Logica**: 1. Autenticare l'utente e ottenere il `userId`. 2. Verificare che la lega (`league-id`) esista e sia nello stato `repair_active`. 3. Verificare che il `player-id` appartenga alla rosa dell'utente autenticato per quella lega. 4. Invocare la funzione di servizio creata nel punto successivo.

- **Azione 2.2**: Creare una nuova funzione nel service layer per la logica di business.
  - **File**: `src/lib/db/services/auction-league.service.ts` (o un nuovo file `roster.service.ts`).
  - **Funzione**: `releasePlayerFromRoster(leagueId: number, playerId: number, userId: string)`.
  - **Logica**: 1. **Recuperare Quotazione**: Ottenere la quotazione attuale del giocatore dalla tabella `players`. 2. **Eliminare Assegnazione**: Rimuovere la riga corrispondente dalla tabella `player_assignments`. 3. **Aggiornare Budget**: - Aggiungere i crediti recuperati al `current_budget` dell'utente nella tabella `league_participants`. - Creare una nuova voce nella tabella `budget_transactions` per tracciare l'operazione (es. `type: 'release'`, `amount: [quotazione]`, `description: 'Svincolo di [Nome Giocatore]'`). 4. **Restituire**: Confermare l'avvenuta operazione.

---

### Fase 3: Implementazione Interfaccia Utente (Frontend)

**Obiettivo**: Fornire ai manager un'interfaccia chiara per svincolare i giocatori.

- **Azione 3.1**: Identificare e modificare il componente che visualizza la rosa del manager.

  - _Ricerca_: Trovare il componente React che mostra la lista dei giocatori di una squadra (es. `MyRoster.tsx`, `TeamView.tsx` o simile).

- **Azione 3.2**: Aggiungere l'icona di svincolo condizionale.

  - **Logica**: All'interno del componente, quando si mappa la lista dei giocatori, aggiungere un `<button>` con un'icona a forma di cestino.
  - **Condizione**: Mostrare questo pulsante solo se lo stato della lega è `repair_active`.

- **Azione 3.3**: Implementare il flusso di interazione.
  - **`onClick`**: Al click sul pulsante, mostrare un modale di conferma (`AlertDialog` o simile).
    - **Testo**: "Sei sicuro di voler svincolare [Nome Giocatore]? Riceverai [Quotazione Attuale] crediti. L'azione è irreversibile."
  - **Conferma**: Se l'utente conferma, inviare una richiesta `DELETE` all'endpoint creato nella Fase 2.
  - **Feedback**: Alla risposta positiva dall'API, aggiornare la UI (rimuovendo il giocatore dalla lista) e mostrare una notifica di successo (es. "Giocatore svincolato con successo!").

---

### Fase 4: Test e Validazione

**Obiettivo**: Assicurarsi che la nuova funzionalità sia robusta e non introduca regressioni.

- **Test Backend**:
  - Un utente non può svincolare giocatori se la lega non è in `repair_active`.
  - Un utente non può svincolare giocatori di un'altra squadra.
  - Verificare il corretto accredito del budget e la registrazione della transazione.
- **Test Frontend**:
  - L'icona del cestino appare solo in modalità `repair_active`.
  - Il modale di conferma mostra i dati corretti.
  - La UI si aggiorna correttamente dopo lo svincolo.
- **Test di Regressione**:
  - Verificare che le aste funzionino normalmente nello stato `draft_active`.
  - Verificare che tutto sia bloccato (offerte, chiamate) in `market_closed` e altri stati non attivi.
