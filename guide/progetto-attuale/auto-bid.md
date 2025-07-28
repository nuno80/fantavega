# Sistema Auto-Bid - Documentazione Tecnica v2.1

## Panoramica

Il sistema auto-bid permette agli utenti di impostare un'offerta massima automatica per un giocatore. Il backend gestisce tutta la logica internamente e restituisce solo il risultato finale all'interfaccia utente, seguendo il principio "Black Box".

## Principi Fondamentali

### Logica eBay (Backend)

- L'auto-bid più alta vince.
- Il vincitore paga solo 1 credito più dell'auto-bid più alta tra i perdenti.
- In caso di parità, vince chi ha impostato l'auto-bid per primo.
- **Tutti i calcoli sono invisibili al frontend**.

### Attivazione Automatica (Backend)

- Si attiva quando qualcuno supera l'offerta corrente.
- Funziona anche se l'utente è offline.
- Rispetta sempre il budget disponibile.
- **Frontend riceve solo il risultato finale**.

### Visualizzazione Frontend (Semplificata)

- **Propria Auto-Bid**: Visibile solo all'utente che l'ha impostata.
- **Offerta Corrente**: Sempre il risultato finale post-calcoli.
- **Nessun Dettaglio**: Meccanismi interni nascosti.

## Flussi Operativi (Backend Logic)

### Scenario 1: Offerta Manuale + Auto-Bid Simultanei

**Input**: User A fa offerta manuale di 25 crediti e imposta auto-bid a 50 crediti

**Processo Backend**:
1. Riceve richiesta con `amount: 25` e `max_amount: 50`
2. **Transazione Atomica**:
   - Valida offerta manuale (25 > offerta corrente)
   - **UPSERT auto-bid** (50 crediti) **prima** della simulazione
   - Raccoglie tutti gli auto-bid attivi (incluso quello appena impostato)
   - Simula battaglia auto-bid
3. Applica risultato finale al database
4. Invia notifiche real-time

**Risultato**: Auto-bid viene sempre considerato nella prima battaglia, eliminando race conditions.

### Scenario 2: Battaglia Auto-Bid Multipli

**Setup**:
- User A: auto-bid 50 crediti (impostato ieri)
- User B: auto-bid 45 crediti (impostato oggi)
- User C: offerta manuale 30 crediti + auto-bid 60 crediti (simultanei)

**Simulazione**:
1. User C piazza offerta manuale (30 crediti)
2. Sistema raccoglie auto-bid: A(50), B(45), C(60)
3. **Vincitore**: User C (60 crediti, massimo)
4. **Prezzo Finale**: 51 crediti (50 + 1, secondo migliore)
5. **Notifica**: User C vince con 51 crediti

## Implementazione Tecnica

### API Endpoint Unificato

**POST** `/api/leagues/[league-id]/players/[player-id]/bids`

```json
{
  "amount": 25,
  "bid_type": "manual",
  "max_amount": 50  // Auto-bid opzionale
}
```

### Backend Service (bid.service.ts)

```typescript
export async function placeBidOnExistingAuction({
  leagueId,
  userId,
  playerId,
  bidAmount,
  bidType = "manual",
  autoBidMaxAmount, // Nuovo parametro
}: PlaceBidParams) {
  const transaction = db.transaction(() => {
    // 1. Validazioni standard
    
    // 2. UPSERT auto-bid PRIMA della simulazione
    if (autoBidMaxAmount && autoBidMaxAmount > 0) {
      db.prepare(`
        INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
        VALUES (?, ?, ?, TRUE, ?, ?)
        ON CONFLICT(auction_id, user_id) 
        DO UPDATE SET 
          max_amount = excluded.max_amount,
          is_active = TRUE,
          updated_at = excluded.updated_at
      `).run(auction.id, userId, autoBidMaxAmount, now, now);
    }
    
    // 3. Raccolta auto-bid (incluso quello appena impostato)
    const allActiveAutoBids = db.prepare(`
      SELECT user_id, max_amount, created_at
      FROM auto_bids
      WHERE auction_id = ? AND is_active = TRUE
    `).all(auction.id);
    
    // 4. Simulazione battaglia
    const battleResult = simulateAutoBidBattle(bidAmount, userId, allActiveAutoBids);
    
    // 5. Applicazione risultato
    // ...
  });
}
```

### Frontend Semplificato (StandardBidModal.tsx)

```typescript
const handleSubmitBid = async () => {
  const body = { 
    amount: bidAmount,
    bidType: "manual",
    max_amount: useAutoBid ? maxAmount : undefined, // Unificato
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  // Una sola richiesta, nessuna race condition
};
```

## Correzioni Implementate (v2.1)

### Problema Risolto: Race Condition

**Causa Originale**:
```
1. Frontend: POST /bids (offerta manuale)
2. Backend: Simula battaglia con auto-bid vecchi
3. Frontend: POST /auto-bid (nuovo auto-bid) ← TROPPO TARDI
```

**Soluzione Implementata**:
```
1. Frontend: POST /bids (offerta + auto-bid insieme)
2. Backend: UPSERT auto-bid DENTRO la transazione
3. Backend: Simula battaglia con auto-bid aggiornati ✓
```

### Vantaggi della Nuova Implementazione

1. **Atomicità**: Auto-bid e offerta nella stessa transazione
2. **Consistenza**: Dati sempre sincronizzati
3. **Performance**: Una sola chiamata API invece di due
4. **Affidabilità**: Elimina completamente le race conditions
5. **Semplicità**: Frontend più pulito, meno gestione di stato

### Cleanup Completato

- Rimossa prop `onAutoBidSet` da tutti i componenti
- Eliminata funzione `handleAutoBidSet` separata
- Semplificato flusso di dati nel frontend
- Mantenuta compatibilità con auto-bid esistenti

## Cosa NON si vede più

### Indicatori Rimossi (Black Box Approach)

- **Contatori Auto-Bid**: Non mostra quanti utenti hanno auto-bid attivi
- **Indicatori Competizione**: Non rivela chi sta competendo
- **Step di Battaglia**: Simulazione invisibile al frontend
- **Dettagli Interni**: Solo risultato finale visibile

### Notifiche Semplificate

**Prima (v2.0)**:
- "Auto-bid di TeamA attivata: 45 crediti"
- "Battaglia in corso..."
- "TeamB supera con auto-bid: 46 crediti"
- "Risultato finale: TeamC vince con 50 crediti"

**Ora (v2.1)**:
- "Battaglia auto-bid conclusa! Vincitore: TeamC con 50 crediti."

## Testing e Validazione

### Scenari di Test Critici

1. **Primo Auto-Bid**: Offerta manuale + auto-bid simultanei
2. **Auto-Bid Multipli**: 3+ utenti con auto-bid diversi
3. **Parità**: Due auto-bid identici (priorità temporale)
4. **Budget Insufficiente**: Auto-bid superiore al budget
5. **Offline**: Auto-bid attivato con utente disconnesso

### Comandi di Test

```bash
# Reset database per test puliti
pnpm run db:reset

# Seed con dati di test
pnpm run db:seed

# Avvia server di sviluppo
pnpm run dev
```

## Architettura del Sistema

### Componenti Principali

1. **bid.service.ts**: Logica core delle offerte e auto-bid
2. **StandardBidModal.tsx**: Interfaccia unificata per offerte
3. **Socket.IO**: Notifiche real-time per risultati
4. **auto_bids table**: Storage persistente degli auto-bid

### Flusso di Dati

```
Frontend Modal → API Route → Bid Service → Database Transaction
                                ↓
Socket Notifications ← Battle Simulation ← Auto-Bid Collection
```

### Garanzie di Consistenza

- **Transazioni ACID**: Operazioni atomiche
- **Validazioni Multiple**: Budget, slot, timing
- **Rollback Automatico**: In caso di errori
- **Notifiche Affidabili**: Solo dopo commit successo

## Conclusioni

Il sistema auto-bid v2.1 rappresenta un'implementazione robusta e affidabile che:

- **Elimina** le race conditions attraverso transazioni atomiche
- **Semplifica** l'interfaccia utente con approccio "Black Box"
- **Garantisce** consistenza dei dati in tutti gli scenari
- **Mantiene** le performance con chiamate API ottimizzate
- **Supporta** scenari complessi di competizione multipla

La correzione del timing fix assicura che il sistema funzioni correttamente dalla prima interazione, fornendo un'esperienza utente fluida e prevedibile.