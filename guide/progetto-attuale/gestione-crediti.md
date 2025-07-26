# 💡 Logica Corretta Crediti Bloccati

## Principio Fondamentale

- **Auto-bid = Promessa di rilancio** → Devo sempre avere i crediti per mantenerla.
- **Crediti bloccati** = `MAX(offerta_manuale, auto-bid_max)`
- I crediti restano bloccati fino all'abbandono dell'asta.

---

## Analisi della Gestione Attuale

### 1. Blocco Iniziale (Linea 542) ✅

```javascript
incrementLockedCreditsStmt.run(effectiveBidAmount, leagueId, userId);
// effectiveBidAmount = Math.max(bidAmount, currentBidderAutoBid.max_amount)
```

- ✅ **Corretto**: Blocca il massimo tra offerta manuale e auto-bid.

### 2. Sblocco Precedente Offerente (Linee 509-514) ✅

```javascript
decrementLockedCreditsStmt.run(previousBid.amount, leagueId, previousHighestBidderId);
```

- ✅ **Corretto**: Sblocca solo quando qualcuno supera la tua offerta.

### 3. Quando Auto-bid Competitivo Vince (Linee 695-699) ✅

```javascript
// Sblocca current user (che ha perso)
decrementLockedCreditsStmt.run(effectiveBidAmount, leagueId, userId);
// Blocca vincitore auto-bid
incrementLockedCreditsStmt.run(finalBidAmount, leagueId, winningAutoBid.user_id);
```

- ✅ **Corretto**: Current user perde → crediti sbloccati.
- ✅ **Corretto**: Vincitore auto-bid → crediti bloccati al prezzo finale.

### 4. Aggiornamento Crediti Current User (Linee 637-641) ✅

```javascript
const creditDifference = finalBidAmount - bidAmount;
incrementLockedCreditsStmt.run(creditDifference, leagueId, userId);
```

- ✅ **Corretto**: Se auto-bid si attiva, blocca la differenza.

---

## ✅ CONCLUSIONE

La gestione crediti è **CORRETTA** e in linea con la nuova logica!

### Perché funziona:

1.  **Auto-bid = Promessa**: I crediti sono sempre bloccati al massimo importo possibile che l'utente è disposto a offrire.
2.  **Offerta manuale**: Se l'offerta manuale è superiore all'auto-bid, i crediti vengono bloccati per coprire la nuova offerta più alta.
3.  **Perdita asta**: I crediti vengono sbloccati immediatamente non appena l'utente viene superato.
4.  **Vincita asta**: I crediti restano bloccati fino alla fine dell'asta per garantire il pagamento.

La logica implementata rispetta perfettamente il principio che l'auto-bid è una promessa di rilancio che deve essere sempre garantita dai crediti bloccati! 🎯

---

##  Penalità e Visualizzazione UI

### Gestione delle Penalità

Le penalità per il mancato rispetto dei requisiti della rosa vengono gestite separatamente dai crediti bloccati e hanno un impatto diretto sul budget dell'utente.

- **Azione**: Le penalità vengono sottratte direttamente dal `current_budget` dell'utente nel database.
- **Logica**: Il servizio `penalty.service.ts` si occupa di applicare queste deduzioni e di registrare una transazione di tipo `penalty_requirement`.

### Impatto sulla UI (Componente `BudgetDisplay`)

La visualizzazione del budget nella pagina dell'asta tiene conto delle penalità in modo implicito:

1.  **`Budget attuale`**: Il valore mostrato (`currentBudget`) è già al netto di eventuali penalità applicate.
2.  **`Crediti bloccati`**: Questo valore (`lockedCredits`) rappresenta solo i fondi impegnati per le offerte e **non include le penalità**.
3.  **`Budget disponibile`**: Calcolato come `currentBudget - lockedCredits`, questo valore riflette accuratamente i fondi disponibili per nuove offerte, tenendo conto sia delle penalità (già sottratte dal `currentBudget`) sia dei crediti bloccati.
4.  **`% Utilizzo Budget`**: Questa percentuale (`budgetUsedPercentage`) aumenta quando vengono applicate penalità, poiché queste riducono il `currentBudget` e, di conseguenza, aumentano il `spentBudget` (`totalBudget - currentBudget`).

In sintesi, la UI fornisce una visione chiara e accurata della situazione finanziaria, dove le penalità riducono il budget complessivo, mentre i crediti bloccati rappresentano un impegno temporaneo per le aste in corso.
