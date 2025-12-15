# 💡 Gestione Crediti e Auto-Bid (Logica Corretta)

Questo documento descrive la logica di gestione dei crediti bloccati (`locked_credits`), implementata per garantire coerenza e aderenza alle regole di business del gioco.

## Principio Fondamentale: La Promessa dell'Auto-Bid

Il principio cardine del sistema si basa su una regola non negoziabile:

> **L'Auto-bid è una promessa di spesa. Se un utente imposta un auto-bid con un'offerta massima di 100, il sistema deve bloccare immediatamente 100 crediti. L'utente deve sempre essere in grado di mantenere la sua promessa.**

Di conseguenza, i `locked_credits` di un utente non sono legati all'offerta corrente di un'asta, ma rappresentano la **somma totale di tutte le sue promesse attive**.

`locked_credits` = SOMMA(`max_amount`) di tutti gli `auto_bids` attivi per un utente.

---

## Flusso Logico Implementato

La logica è implementata gestendo tre eventi distinti:

### 1. Impostazione/Modifica di un Auto-Bid

Questa è la fase più critica e l'unico momento in cui i `locked_credits` vengono modificati a causa di un auto-bid.

- **File Responsabile:** `.../api/leagues/[league-id]/players/[player-id]/auto-bid/route.ts`
- **Logica:**
  1. Quando un utente imposta o modifica un auto-bid, il sistema calcola la **differenza** tra il vecchio `max_amount` e quello nuovo.
  2. Verifica che l'utente abbia abbastanza budget disponibile per coprire l'**aumento** dei crediti da bloccare.
  3. Aggiorna la colonna `locked_credits` nella tabella `league_participants` aggiungendo o sottraendo la differenza calcolata.
  4. Salva o aggiorna l'auto-bid nella tabella `auto_bids`. Se l'importo è 0, l'auto-bid viene disattivato e i crediti corrispondenti sbloccati.

### 2. Durante lo Svolgimento di un'Asta

La gestione dei crediti è dinamica e reagisce agli eventi dell'asta in tempo reale.

- **File Responsabile:** `.../lib/db/services/bid.service.ts`
- **Logica:**
  1. **Se un'offerta supera un auto-bid**: Quando un utente (Utente B) piazza un'offerta che supera il `max_amount` di un altro utente (Utente A), l'auto-bid dell'Utente A viene considerato concluso.
  2. **Sblocco Immediato**: Il sistema disattiva immediatamente l'auto-bid dell'Utente A (`is_active = FALSE`) e sblocca i `locked_credits` corrispondenti, restituendoli al suo budget disponibile. La promessa di spesa è terminata.
  3. **Nessuna Variazione per il Miglior Offerente**: L'importo dei `locked_credits` dell'utente che detiene l'offerta più alta (o l'auto-bid più alto) non cambia, rimanendo bloccato sulla sua promessa massima.
  4. **🆕 NUOVO - Controllo Compliance per Utenti Superati**: Quando un utente perde un'offerta vincente (viene superato), il sistema **verifica automaticamente il suo stato di compliance**. Se perdere quella slot lo rende non-compliant, il timer delle penalità viene **riavviato automaticamente** con un nuovo periodo di grazia di 1 ora.

### 3. Conclusione di un'Asta

Quando un'asta termina, la promessa dell'auto-bid viene sciolta.

- **File Responsabile:** `.../lib/db/services/bid.service.ts` (funzione `processExpiredAuctionsAndAssignPlayers`)
- **Logica:**
  1. Il sistema sblocca i `locked_credits` di **tutti i partecipanti** all'asta che avevano un auto-bid attivo, disattivandoli (`is_active = FALSE`).
  2. Per il **vincitore**, il `current_budget` viene ridotto del **prezzo finale di acquisto**.
  3. **🆕 NUOVO - Controllo Compliance per Utenti Perdenti**: Il sistema verifica automaticamente lo stato di compliance di **tutti gli utenti che avevano fatto offerte** (auto-bid o manuali) ma non hanno vinto. Se perdere quell'asta li rende non-compliant, il timer delle penalità viene riavviato automaticamente.

---

## Esempio Pratico

**Scenario:**

- Asta per "Player Z".
- **Utente A** imposta un **auto-bid** con un massimo di **20**.
- **Utente B** imposta un **auto-bid** con un massimo di **50**.
- **Utente A** ha una rosa che diventa non-compliant se perde questo giocatore.

| Evento                 | Azione del Sistema                  | `locked_credits` Utente A | `locked_credits` Utente B | Compliance Utente A  | Note                                                                                                                                                                                                                                                                                                          |
| :--------------------- | :---------------------------------- | :------------------------ | :------------------------ | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. **Set Auto-Bid A**  | Utente A imposta auto-bid a 20.     | **20**                    | 0                         | ✅ Compliant         | I crediti di A vengono bloccati sulla sua promessa. La sua offerta vincente lo rende compliant.                                                                                                                                                                                                               |
| 2. **Set Auto-Bid B**  | Utente B imposta auto-bid a 50.     | **20**                    | **50**                    | ✅ Compliant         | Anche i crediti di B vengono bloccati.                                                                                                                                                                                                                                                                        |
| 3. **Offerta Esterna** | Utente C offre 21.                  | **0**                     | **50**                    | ❌ **NON-Compliant** | L'offerta di C (21) supera il `max_amount` di A (20). L'auto-bid di A viene disattivato e i suoi 20 crediti sono **immediatamente sbloccati**. **🆕 NUOVO**: Il sistema rileva che A è diventato non-compliant e **riavvia il timer** (1 ora di grazia). L'auto-bid di B (50) risponde e l'offerta sale a 22. |
| 4. **Fine Asta**       | Utente B vince il giocatore per 35. | **0**                     | **0**                     | ❌ NON-Compliant     | La promessa di B è sciolta. I 50 crediti vengono sbloccati e il suo budget reale viene ridotto di 35. Il timer di A continua (o applica penalità se scaduto).                                                                                                                                                 |

---

## Tabelle del Database Coinvolte

- **`league_participants`**:

  - `locked_credits`: Memorizza la somma di tutte le promesse (`max_amount`) degli auto-bid attivi per l'utente.
  - `current_budget`: Il budget reale e spendibile dell'utente. Viene modificato solo a fine asta o per le penalità.

- **`auto_bids`**:

  - `max_amount`: L'importo della promessa che viene sommato ai `locked_credits`.
  - `is_active`: Flag che indica se la promessa è attiva e deve essere conteggiata.

- **`budget_transactions`**:
  - Traccia solo i movimenti del `current_budget` (es. `win_auction_debit`, `penalty_requirement`). **Non traccia** le modifiche ai `locked_credits`.

---

## Gestione delle Penalità (Logica Aggiornata)

La logica delle penalità è stata aggiornata per essere **attivata automaticamente** dagli eventi di gioco, garantendo un'applicazione tempestiva e coerente.

- **Azione**: Le penalità vengono sottratte direttamente dal `current_budget` dell'utente.
- **Logica**: La funzione `checkAndRecordCompliance` in `penalty.service.ts` ora include la logica per applicare la penalità. Se un utente è non-compliant e il suo periodo di grazia di 1 ora è scaduto, la funzione applica la deduzione e registra una transazione di tipo `penalty_requirement`.
- **Impatto UI**: Il budget visualizzato è sempre aggiornato e riflette le penalità applicate. I `locked_credits` non sono influenzati dalle penalità.

---

## 🆕 Sistema di Compliance e Penalità Automatiche (Logica Aggiornata)

### Integrazione con la Gestione Crediti e Trigger Event-Driven

Il sistema di compliance è ora **event-driven**. Non si basa più su uno scheduler separato, ma è direttamente integrato nei flussi di interazione dell'utente.

**Trigger Points per il Controllo Compliance e Applicazione Penalità:**

> ⚠️ **IMPORTANTE**: Il sistema di compliance funziona solo per utenti che hanno effettuato almeno un login. Questo è un comportamento voluto per evitare penalità a utenti che non hanno mai interagito con l'applicazione. Al primo login, viene creato un record nella tabella `user_sessions` che abilita il monitoraggio della compliance.

1. **Qualsiasi Interazione Rilevante**: Azioni come il login, il piazzare un'offerta, o qualsiasi evento che invochi la funzione `checkAndRecordCompliance`.
2. **Controllo Automatico**: Ad ogni chiamata, la funzione `checkAndRecordCompliance` esegue i seguenti passi:
   - Verifica lo stato di compliance attuale dell'utente.
   - Se l'utente diventa non-compliant, avvia il timer di grazia di 1 ora.
   - **Se l'utente è già non-compliant e il timer di grazia è scaduto**, applica immediatamente una penalità di 5 crediti (fino al massimo di 25).
3. **Perdita di Offerta Vincente** (`placeBidOnExistingAuction`):
   - Quando un utente viene superato in un'asta, viene chiamato `checkAndRecordCompliance`.
   - Questo controllo immediato valuta se la perdita dello slot rende l'utente non-compliant e, se necessario, avvia il timer.
4. **Conclusione Asta Senza Vittoria** (`processExpiredAuctionsAndAssignPlayers`):
   - Al termine di un'asta, `checkAndRecordCompliance` viene chiamato per tutti i partecipanti che non hanno vinto.
   - Questo assicura che anche la perdita di un'opportunità di acquisire un giocatore possa avviare il timer di compliance se necessario.

**Logica di Business:**

```typescript
// Pseudo-codice della logica implementata
if (user.lostBid && user.becameNonCompliant) {
  restartPenaltyTimer(user, 1_HOUR_GRACE_PERIOD);
  console.log('CRITICAL: User became non-compliant after losing bid - penalty timer restarted');
}
```

**Esempio di Scenario Critico:**

- Manager ha 2 Portieri: 1 assegnato + 1 offerta vincente
- Requisito minimo: 1 Portiere (N-1 = 2-1 = 1)
- Stato: ✅ Compliant (ha 2, serve 1)
- **Viene superato nell'asta** → rimane solo con 1 Portiere assegnato
- Nuovo stato: ❌ NON-Compliant (ha 1, serve 1, ma regola è N-1 quindi OK)
- **Sistema rileva il cambiamento e riavvia timer se necessario**

**Esempio di cosa accade quando scadee l'ora di grazia** │
│ │
│ • Team Fede ha il timer di compliance attivo da ~2h 57min │
│ • Periodo di grazia: 1 ora (già scaduto) │
│ • Prossima penalità: Tra 3 minuti (ogni ora dopo il periodo di grazia) │
│ │
│ COSA DOVREBBE ACCADERE TRA 3 MINUTI: │
│ │
│ 1. TRIGGER AUTOMATICO │
│ │
│ • Il sistema rileva automaticamente che è passata un'altra ora │
│ • Non serve intervento manuale - il controllo avviene quando: │
│ • Team Fede accede alla pagina auction/players │
│ • Qualcuno piazza un'offerta che coinvolge Team Fede │
│ • Il timer del ComplianceTimer raggiunge 00:00 │
│ │
│ 2. APPLICAZIONE PENALITÀ │
│ │
│ • Deduzione: 5 crediti dal budget corrente di Team Fede │
│ • Transazione: Creata nel database con tipo penalty_requirement │
│ • Descrizione: "Penalità per mancato rispetto requisiti rosa (Ora 2/5)" │
│ • Limite: Massimo 5 penalità per ciclo, 25 crediti totali │
│ │
│ 3. AGGIORNAMENTO CREDITI │
│ │
│ • Budget disponibile: Ridotto di 5 crediti │
│ • Budget bloccato: Rimane invariato (le penalità non toccano i crediti bloccati) │
│ • Storico transazioni: Nuova voce visibile nell'admin │
│ │
│ 4. VISUALIZZAZIONE FRONTEND │
│ │
│ Nel ManagerColumn di Team Fede apparirà: │
│ │
│ • Icona P rossa con il numero aggiornato di crediti di penalità │
│ • Budget disponibile ridotto di 5 crediti nella sezione budget │
│ • Timer compliance che si resetta per il prossimo ciclo orario │
│ │
│ Per tutti gli altri manager: │
│ │
│ • Icona P rossa visibile anche a loro (trasparenza del sistema) │
│ • Possono vedere il totale delle penalità di Team Fede │
│ │
│ 5. NOTIFICHE │
│ │
│ • Toast notification per Team Fede: "Penalità applicata: 5 crediti" │
│ • Aggiornamento real-time via Socket.IO per tutti i partecipanti │
│ • Log console: Conferma dell'applicazione della penalità │
│ │
│ 6. CICLO CONTINUO │
│ │
│ • Timer riavviato: Nuovo countdown di 1 ora per la prossima penalità │
│ • Controllo compliance: Continua finché Team Fede non diventa compliant │
│ • Limite massimo: Si ferma a 25 crediti totali di penalità │
│ │
│ RISULTATO FINALE ATTESO: │
│ │
│ Team Fede vedrà i suoi crediti disponibili diminuire e l'icona P rossa con il numero aggiornato, mentre tutti gli │
│ altri manager potranno vedere pubblicamente le sue penalità accumulate.
