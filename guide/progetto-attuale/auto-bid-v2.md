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

## Logica "Serie di Rilanci Automatici"

### Principio Base

L'auto-bid funziona come una serie di rilanci manuali automatici:

```
Esempio: Fede (auto-bid 20) vs Red (manual 11, auto-bid 25)

1. Red offre 11 manuale
2. Sistema simula: Fede rilancia a 12, Red a 13, Fede a 14...
3. Continua fino a: Fede 20, Red 21
4. Fede non può più rilanciare (max 20)
5. Risultato finale: Red vince con 21 crediti
```

### Formula Semplificata

```javascript
// Auto-bid vs Auto-bid
const loserMaxBid = Math.min(autobid_A, autobid_B);
const winnerMaxBid = Math.max(autobid_A, autobid_B);
const finalBidAmount = Math.min(loserMaxBid + 1, winnerMaxBid);
```

## Modifiche Implementative Necessarie

### Backend (bid.service.ts)

- ✅ Logica auto-bid già implementata correttamente.
- ✅ Calcoli interni nascosti al frontend.
- ✅ Risultato finale restituito via Socket.IO.

### Frontend (Rimuovere)

- ❌ Indicatori auto-bid di altri utenti.
- ❌ Notifiche multiple confuse.
- ❌ Visualizzazione calcoli intermedi.

### Frontend (Mantenere)

- ✅ Modal per impostare propria auto-bid.
- ✅ Visualizzazione propria auto-bid impostata.
- ✅ Risultato finale dell'asta.

## Vantaggi della Nuova Logica

### 🎯 User Experience

- **Semplicità**: Un solo risultato finale da capire.
- **Chiarezza**: Nessuna confusione sui meccanismi interni.
- **Trasparenza**: Ogni utente vede la propria strategia.

### 🔧 Manutenibilità

- **Backend Centralizzato**: Tutta la logica in un posto.
- **Frontend Semplice**: Solo visualizzazione risultati.
- **Debug Facile**: Meno complessità UI.

### 🚀 Performance

- **Meno Eventi Socket**: Solo risultati finali.
- **UI Più Veloce**: Meno aggiornamenti in tempo reale.
- **Codice Pulito**: Separazione netta responsabilità.

---

## ✅ Verifica di Coerenza e Stato Attuale (Luglio 2025)

A seguito di un'analisi del codice sorgente, è stato verificato che **l'implementazione attuale del sistema di auto-bid è pienamente coerente con i principi descritti in questo documento.**

Le sezioni precedenti che descrivevano un "problema" o una "logica da implementare" si riferivano a una versione passata del codice e sono state rimosse per evitare confusione.

### Punti Chiave Verificati

1. **Logica Backend Corretta**:

   - Il file `src/lib/db/services/bid.service.ts` implementa correttamente la logica di tipo "eBay".
   - La formula utilizzata è `finalBidAmount = Math.min(loserMaxBid + 1, winnerMaxBid)`, che rispecchia fedelmente il comportamento atteso.
   - La gestione dei casi di parità (vince chi ha impostato l'auto-bid per primo) è implementata come da specifica.

2. **Frontend "Black Box"**:

   - I componenti React, come `AuctionRealtimeDisplay.tsx`, si limitano a visualizzare i dati finali ricevuti dal backend (`newPrice`, `highestBidderId`).
   - Non c'è alcuna esposizione dei meccanismi interni dell'auto-bid, né indicatori visivi delle auto-bid degli altri utenti.

3. **Conclusione**:
   - L'applicazione si comporta come descritto. La documentazione è ora allineata allo stato attuale del software, confermando che non ci sono discrepanze tra la logica attesa e quella implementata.
