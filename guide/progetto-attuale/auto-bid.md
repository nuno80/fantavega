# Sistema Auto-Bid - Documentazione Tecnica v2.0

## Panoramica

Il sistema auto-bid permette agli utenti di impostare un'offerta massima automatica per un giocatore. Il backend gestisce tutta la logica internamente e restituisce solo il risultato finale all'interfaccia utente, seguendo il principio "Black Box".

## Principi Fondamentali

### 🎯 Logica eBay (Backend)

- L'auto-bid più alta vince.
- Il vincitore paga solo 1 credito più dell'auto-bid più alta tra i perdenti.
- In caso di parità, vince chi ha impostato l'auto-bid per primo.
- **Tutti i calcoli sono invisibili al frontend**.

### 🔄 Attivazione Automatica (Backend)

- Si attiva quando qualcuno supera l'offerta corrente.
- Funziona anche se l'utente è offline.
- Rispetta sempre il budget disponibile.
- **Frontend riceve solo il risultato finale**.

### 🎨 Visualizzazione Frontend (Semplificata)

- **Propria Auto-Bid**: Visibile solo all'utente che l'ha impostata.
- **Offerta Corrente**: Sempre il risultato finale post-calcoli.
- **Nessun Dettaglio**: Meccanismi interni nascosti.

## Flussi Operativi (Backend Logic)

### Scenario 1: Auto-bid vs Offerta Manuale

```
Backend:
14:00 - User A imposta auto-bid 50 crediti
14:05 - User B offre manualmente 30 crediti
14:05 - Sistema calcola internamente: User A vince con 31 crediti

Frontend:
User A vede: [P] Ronaldo | 50 | 31 | 1:30 (sua auto-bid | risultato finale)
User B vede: [P] Ronaldo | 31 | 1:30 (solo risultato finale)
Notifica: "User A ha vinto l'offerta con 31 crediti"
```

### Scenario 2: Auto-bid vs Auto-bid

```
Backend:
14:00 - User A imposta auto-bid 50 crediti
14:05 - User B imposta auto-bid 60 crediti
14:05 - Sistema calcola internamente: User B vince con 51 crediti

Frontend:
User A vede: [P] Ronaldo | 50 | 51 | 1:30 (sua auto-bid | risultato finale)
User B vede: [P] Ronaldo | 60 | 51 | 1:30 (sua auto-bid | risultato finale)
Notifica: "User B ha vinto l'offerta con 51 crediti"
```

### Scenario 3: Parità Auto-bid

```
Backend:
14:00 - User A imposta auto-bid 50 crediti
14:05 - User B imposta auto-bid 50 crediti
14:05 - Sistema calcola: User A vince (primo) con 50 crediti

Frontend:
User A vede: [P] Ronaldo | 50 | 50 | 1:30 (sua auto-bid | risultato finale)
User B vede: [P] Ronaldo | 50 | 50 | 1:30 (sua auto-bid | risultato finale)
Notifica: "User A ha vinto l'offerta con 50 crediti"
```

L'API src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts gestisce il front end va sempre controllata per essere sicuri che:
Frontend → POST /bids (amount: 2, auto_bid_max: 10) │
│ Backend → Crea/aggiorna auto-bid PRIMA di processare offerta │
│ Backend → Processa offerta (trova entrambi gli auto-bid) │
│ Backend → Restituisce risultato finale

## Integrazione Real-Time (Semplificata)

### Socket.IO Events (Solo Risultato Finale)

- `auction-update`: Aggiornamento stato asta con risultato finale.
- `bid-surpassed-notification`: Notifica semplificata di superamento.

### Notifiche Utente (Unificate)

- **Offerta Superata**: "Sei stato superato su [Player]! Offerta vincente: X crediti"
- **Asta Vinta**: "Hai vinto l'asta per [Player] con X crediti"
- **Budget Insufficiente**: "Offerta non valida: budget insufficiente"

### Cosa NON viene più notificato

- ❌ "Auto-bid attivata"
- ❌ "Auto-bid ha superato la tua offerta"
- ❌ Dettagli sui meccanismi interni
- ❌ Calcoli intermedi

## Interfaccia Utente (Semplificata)

### Visualizzazione Auto-bid

```
Formato: [P] Ronaldo | 50 | 42 | 1:30
         Ruolo Nome   | AutoBid | Offerta | Timer
                      | (solo mia) | (finale) |
```

- **Auto-Bid Personale**: Visibile solo se l'utente l'ha impostata.
- **Offerta Corrente**: Sempre il risultato finale dei calcoli backend.
- **Nessun Indicatore**: Non si vedono auto-bid di altri utenti.

### Modal di Gestione (Invariato)

- **Imposta Auto-bid**: Campo importo + toggle attivazione.
- **Modifica Auto-bid**: Aggiorna importo esistente.
- **Disattiva Auto-bid**: Imposta importo a 0.

### Cosa NON si vede più

- ❌ Contatori auto-bid globali
- ❌ Indicatori auto-bid di altri utenti
- ❌ Importi auto-bid di competitors
- ❌ Badge o icone auto-bid generiche

## Logica di Simulazione Auto-Bid: "Serie di Rilanci Automatici"

**Stato**: ✅ **COMPLETATO E VERIFICATO (Luglio 2025)**

Questa sezione descrive l'attuale logica di auto-bid, basata su un sistema di simulazione di battaglia completo che garantisce correttezza e coerenza. Il refactoring è stato completato e la nuova logica è attiva.

### 📋 Principio di Funzionamento

Quando un utente piazza un'offerta manuale, il sistema non si limita a un singolo rilancio, ma **simula l'intera "battaglia" di auto-bid in memoria**. Questo processo determina il vincitore e il prezzo finale in un'unica operazione atomica, replicando fedelmente una serie di rilanci manuali.

- **Esempio Corretto**: `Red bid 72 → Simulazione completa battaglia auto-bid → Risultato finale 75 ✅`

---

### 🔧 Logica Implementata

La logica è implementata tramite la funzione `simulateAutoBidBattle()` nel file `src/lib/db/services/bid.service.ts`.

#### Algoritmo di Simulazione

1. **Offerta Iniziale**: La simulazione parte dall'offerta manuale appena piazzata.
2. **Ciclo di Battaglia**: Il sistema esegue un loop fino a quando non ci sono più rilanci possibili:
   a. **Ricerca Concorrenti**: Trova tutti gli auto-bid attivi che possono superare l'offerta corrente.
   b. **Priorità**: Ordina i concorrenti per data di creazione (`created_at` ascendente), dando priorità a chi ha impostato l'auto-bid per primo.
   c. **Rilancio**: Il primo auto-bid valido nella lista rilancia di `+1` (o fino al suo massimo).
   d. **Aggiornamento**: L'offerta corrente e l'offerente vengono aggiornati.
   e. **Ripetizione**: Il ciclo si ripete fino a quando nessun auto-bid può più rilanciare.
3. **Risultato Finale**: L'ultimo offerente e l'importo finale vengono restituiti come risultato della battaglia.

---

### ✅ Stato Attuale e Verifica (Luglio 2025)

L'implementazione della logica di simulazione è stata completata e verificata tramite log di produzione. Il sistema si comporta come descritto, garantendo che le aste si risolvano correttamente secondo le regole di priorità e i limiti massimi.

#### Scenario di Test Verificato

I log hanno confermato il corretto funzionamento in scenari complessi:

- **Partecipanti**:
  - **Red**: Auto-bid massimo di 75.
  - **Fede**: Auto-bid massimo di 75, impostato _prima_ di Red (ha la priorità).
- **Azione**: Red piazza un'offerta manuale di **74**.
- **Log della Simulazione**:

  ```
  [BID_SERVICE] Battaglia auto-bid completata in 2 steps.
  [BID_SERVICE] Sequenza battaglia: [
    { bidAmount: 74, bidderId: 'user_2yAf7DnJ7asI88hIP03WtYnzxDL', isAutoBid: false, step: 0 },
    { bidAmount: 75, bidderId: 'user_305PTUmZvR3qDMx41mZlqJDUVeZ', isAutoBid: true, step: 1 }
  ]
  ```

- **Esito Verificato**:
  1. L'offerta manuale di Red (74) innesca la battaglia.
  2. L'auto-bid di Fede (con priorità) risponde, rilanciando a 75.
  3. L'auto-bid di Red non può superare 75.
  4. **Fede vince l'asta con 75 crediti**, come confermato dai log.

Questo conferma che la logica di simulazione è robusta e gestisce correttamente la priorità temporale in caso di parità di offerte massime.

---

## ⚠️ Problemi Critici Identificati e Risolti

### 🔴 **PROBLEMA CRITICO: Cache Auto-bid Stale (Gennaio 2025)**

**Status**: 🔧 **IN RISOLUZIONE**

#### **Descrizione Problema**

Il sistema legge auto-bid **obsoleti** invece di quelli **correnti** impostati dall'utente, causando comportamenti errati al primo rilancio dopo aver aggiornato l'auto-bid.

#### **Scenario Problematico**

```
1. Red imposta auto-bid: 70 crediti (NUOVO valore)
2. Sistema legge auto-bid: 60 crediti (VECCHIO da bid precedente)
3. Risultato: Auto-bid non si attiva correttamente con il valore aggiornato
```

#### **Causa Radice Identificata**

- **Cache prepared statements**: Query SQLite cached con risultati obsoleti
- **Transaction isolation**: Lettura di dati non aggiornati tra transazioni
- **Multiple DB connections**: Inconsistenza tra connessioni database

#### **Evidenze Log**

```
[BID_SERVICE] Current bidder auto-bid: {"max_amount":60,"created_at":1753506601,"updated_at":1753513262}
// Dovrebbe essere: {"max_amount":70,"created_at":1753507753,"updated_at":1753513626}
```

#### **Soluzione Implementata**

**Step 1: Query Non-Cached**

```typescript
// Invece di prepared statement cached, usa query fresh
const autoBidQuery = `
  SELECT ab.max_amount, ab.created_at, ab.updated_at
  FROM auto_bids ab
  WHERE ab.auction_id = ? AND ab.user_id = ? AND ab.is_active = TRUE
  ORDER BY ab.updated_at DESC LIMIT 1
`;
```

**Step 2: Timestamp Validation**

```typescript
// Validazione età timestamp per rilevare dati stale
if (currentBidderAutoBid) {
  const age = now - currentBidderAutoBid.updated_at;
  console.log(`[BID_SERVICE] Auto-bid age: ${age} seconds`);

  if (age > 300) {
    // 5 minuti
    console.warn(`[BID_SERVICE] Auto-bid seems stale (${age}s old)`);
  }
}
```

**Step 3: Logging Migliorato**

```typescript
// Debug dettagliato per monitoraggio
console.log(`[BID_SERVICE] DEBUG - Fresh auto-bid query for user ${userId}`);
console.log(
  `[BID_SERVICE] Auto-bid result: ${JSON.stringify(currentBidderAutoBid)}`
);
```

#### **Fix Applicato**

- ✅ Query diretta invece di prepared statement cached
- ✅ Validazione età timestamp per rilevare dati obsoleti
- ✅ Warning automatico per dati stale
- ✅ Logging dettagliato per monitoraggio continuo
- ✅ Risoluzione del problema al primo rilancio

#### **Risultato Atteso**

```
1. Red imposta auto-bid: 70 crediti
2. Sistema legge auto-bid: 70 crediti (CORRETTO)
3. Risultato: Auto-bid si attiva correttamente con il valore aggiornato
```

### 📋 **Altri Problemi Noti**

I will now modify `src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts` to accept the `autoBidMaxAmount` and pass it to the `placeBidOnExistingAuction` function. I will also remove the now-redundant block of code that handles the auto-bid `UPSERT` separately.

Cline wants to edit this file:

src/app/api/leagues/[league-id]/players/[player-id]/bids/route.ts‎

2

\*\*Checkpoint

Compare

Restore

API Request$0.2107

Now I will update the frontend component `src/components/auction/StandardBidModal.tsx` to send the `autoBidMaxAmount` in the same request as the manual bid. This will eliminate the separate API call and the race condition.

Cline wants to edit this file:

src/components/auction/StandardBidModal.tsx‎

1

\*\*Checkpoint

Compare

Restore

API Request$0.1951

I have now updated the backend logic and the frontend modal. The final step is to remove the now-unused `onAutoBidSet` prop from `AutoBidModal` and `ManagerColumn` to clean up the code and resolve the final TypeScript errors.

I will start with `src/components/auction/AutoBidModal.tsx`.

Cline wants to edit this file:

src/components/auction/AutoBidModal.tsx‎

4

\*\*Checkpoint

Compare

Restore

API Request$0.1898

Now that `AutoBidModal` is updated, I will remove the `onAutoBidSet` prop from `ManagerColumn`'s `InAuctionSlot` component, as it's no longer needed there.

Cline wants to edit this file:

src/components/auction/ManagerColumn.tsx‎

2

\*\*Checkpoint

Compare

Restore

API Request$0.2016

I have now removed the `onAutoBidSet` prop from `InAuctionSlot` and `AutoBidModal`, as it is no longer needed.

The final step is to remove the `onAutoBidSet` prop from the `ManagerColumn` component in `AuctionPageContent.tsx`, as it is no longer a valid prop for `ManagerColumn`.
