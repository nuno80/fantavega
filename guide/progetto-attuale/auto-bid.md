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

## Piano di Refactoring: Auto-bid "Serie di Bid Manuali"

Questa sezione descrive il piano per correggere un comportamento errato nella logica di auto-bid, passando a un sistema di simulazione di battaglia completo.

### 📋 ANALISI PROBLEMA ATTUALE

#### Comportamento Errato

Un'offerta manuale che innesca un auto-bid avversario causa uno stop immediato dopo un singolo rilancio, invece di simulare l'intera sequenza di offerte.

- **Esempio Errato**: `Red bid 72 → Fede auto-bid scatta a 73 → STOP ❌`
- **Esempio Corretto**: `Red bid 72 → Simulazione completa battaglia auto-bid → Risultato finale 75 ✅`

---

### 🔧 SOLUZIONE PROPOSTA

La soluzione consiste nel simulare l'intera "battaglia" di auto-bid in memoria ogni volta che un'offerta manuale viene piazzata, per determinare il vincitore e il prezzo finale in un'unica operazione atomica.

#### STEP 1: Nuova Funzione `simulateAutoBidBattle()`

Creare una funzione dedicata che simula l'intera battaglia auto-bid:

```typescript
function simulateAutoBidBattle(
  initialBid: number,
  initialBidderId: string,
  allAutoBids: AutoBid[],
  auction: Auction
): BattleResult {
  // Simula serie di bid manuali incrementali
  // Ritorna: vincitore finale, importo finale, sequenza bid
}
```

#### STEP 2: Algoritmo di Simulazione

1. Inizia con l'offerta manuale corrente.
2. Esegui un loop fino a quando non ci sono più rilanci possibili:
   a. Trova tutti gli auto-bid attivi che possono superare l'offerta corrente.
   b. Ordinali per priorità (data di creazione, `created_at` ascendente).
   c. Il primo auto-bid valido nella lista rilancia di `+1`.
   d. Aggiorna l'offerta corrente e l'offerente.
   e. Ripeti il ciclo.
3. Ritorna il risultato finale della simulazione.

#### STEP 3: Integrazione nel Bid Service

Sostituire la logica attuale nel `bid.service.ts` con la nuova funzione di simulazione.

- **PRIMA (ERRATO)**: Applicava un singolo rilancio basato sul primo auto-bid concorrente.
- **DOPO (CORRETTO)**: Esegue la simulazione completa e applica solo il risultato finale.

```typescript
// DOPO (CORRETTO):
if (competingAutoBids.length > 0) {
  const battleResult = simulateAutoBidBattle(
    bidAmount,
    userId,
    allAutoBids,
    auction
  );
  // Applica risultato finale della battaglia
}
```

---

### 📊 DETTAGLIO IMPLEMENTAZIONE

#### Fase 1: Strutture Dati

```typescript
interface AutoBidBattleParticipant {
  userId: string;
  maxAmount: number;
  createdAt: number; // Timestamp per priorità
  isActive: boolean; // Per gestire l'esaurimento del max_amount
}

interface BattleStep {
  bidAmount: number;
  bidderId: string;
  isAutoBid: boolean;
  step: number;
}

interface BattleResult {
  finalAmount: number;
  finalBidderId: string;
  battleSteps: BattleStep[];
  totalSteps: number;
}
```

#### Fase 2: Algoritmo Core

```typescript
function simulateAutoBidBattle(
  initialBid: number,
  initialBidderId: string,
  autoBids: AutoBidBattleParticipant[],
  auction: Auction
): BattleResult {
  let currentBid = initialBid;
  let currentBidderId = initialBidderId;
  const battleSteps: BattleStep[] = [];
  let step = 0;

  // Aggiungi bid iniziale
  battleSteps.push({
    bidAmount: currentBid,
    bidderId: currentBidderId,
    isAutoBid: false,
    step: step++,
  });

  while (true) {
    // Trova auto-bid che possono rispondere
    const activeAutoBids = autoBids
      .filter(
        (ab) =>
          ab.isActive &&
          ab.maxAmount > currentBid &&
          ab.userId !== currentBidderId
      )
      .sort((a, b) => a.createdAt - b.createdAt); // Priorità temporale

    if (activeAutoBids.length === 0) {
      break; // Nessuno può rispondere, la battaglia è finita
    }

    // Il primo auto-bid (con priorità) risponde
    const respondingAutoBid = activeAutoBids[0];
    const newBid = Math.min(currentBid + 1, respondingAutoBid.maxAmount);

    currentBid = newBid;
    currentBidderId = respondingAutoBid.userId;

    battleSteps.push({
      bidAmount: currentBid,
      bidderId: currentBidderId,
      isAutoBid: true,
      step: step++,
    });

    // Disattiva l'auto-bid se ha raggiunto il suo limite massimo
    if (newBid >= respondingAutoBid.maxAmount) {
      const participant = autoBids.find(
        (ab) => ab.userId === respondingAutoBid.userId
      );
      if (participant) {
        participant.isActive = false;
      }
    }
  }

  return {
    finalAmount: currentBid,
    finalBidderId: currentBidderId,
    battleSteps,
    totalSteps: step,
  };
}
```

#### Fase 3: Integrazione Database

Nel `bid.service.ts`:

1. Raccogliere tutti gli auto-bid attivi per l'asta.
2. Eseguire `simulateAutoBidBattle()` con i dati raccolti.
3. Applicare **solo il risultato finale** (`finalAmount`, `finalBidderId`) al database.
4. Loggare la sequenza completa della battaglia per il debug.

```typescript
// Esempio di integrazione
const allAutoBids = getAllActiveAutoBidsForAuction(auction.id);
const battleResult = simulateAutoBidBattle(
  effectiveBidAmount,
  userId,
  allAutoBids,
  auction
);

if (battleResult.finalBidderId !== userId) {
  await applyAutoBidWin(battleResult);
} else {
  await applyManualBidWin(battleResult);
}

console.log(
  `[BID_SERVICE] Auto-bid battle completed in ${battleResult.totalSteps} steps`
);
console.log(`[BID_SERVICE] Battle sequence:`, battleResult.battleSteps);
```

---

### 🎯 VANTAGGI SOLUZIONE

1. **Correttezza Logica**: Simula fedelmente una serie di rilanci manuali, rispettando priorità e limiti.
2. **Performance**: La simulazione avviene in memoria, con un solo aggiornamento finale al database.
3. **Manutenibilità**: La logica è isolata, testabile e facile da debuggare grazie alla tracciabilità degli step.
4. **Trasparenza**: I log dettagliati permettono di analizzare ogni battaglia e capire l'esito.

---

### 📋 PIANO IMPLEMENTAZIONE

- **Step 1**: Creare la funzione `simulateAutoBidBattle()` e scrivere test unitari per coprire vari scenari.
- **Step 2**: Integrare la funzione nel `bid.service.ts`, sostituendo la logica di rilancio singolo.
- **Step 3**: Eseguire test di integrazione completi, inclusi scenari con più auto-bid e casi limite.
- **Step 4**: Implementare logging dettagliato e monitoraggio delle performance.

---

### 🚀 RISULTATO ATTESO

**Scenario di Test**:

- Red ha un auto-bid massimo di 75.
- Fede ha un auto-bid massimo di 75, impostato prima di Red (ha la priorità).
- Red piazza un'offerta manuale di 72.

**Sequenza Simulata**:

1. Red (manuale): 72
2. Fede (auto-bid): 73
3. Red (auto-bid): 74
4. Fede (auto-bid): 75
5. Red non può superare 75.
6. Fede vince a 75 (avendo la priorità a parità di importo).

**Log Atteso**:

```
[BID_SERVICE] Auto-bid battle completed in 4 steps.
[BID_SERVICE] Final winner: Fede (75 credits).
[BID_SERVICE] Battle sequence: [ { bid: 72, ... }, { bid: 73, ... }, { bid: 74, ... }, { bid: 75, ... } ]
```

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

#### **1. Gestione Errori**

- Auto-bid non si attiva se l'utente non ha budget sufficiente
- Necessario gestire meglio i casi di errore di rete

#### **2. UI/UX**

- Feedback visivo limitato quando auto-bid si attiva
- Manca indicazione chiara del range di auto-bid attivo

#### **3. Performance**

- Query multiple per verificare auto-bid durante ogni offerta
- Possibile ottimizzazione con caching intelligente (dopo fix cache stale)
