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

### 3. Conclusione di un'Asta

Quando un'asta termina, la promessa dell'auto-bid viene sciolta.

- **File Responsabile:** `.../lib/db/services/bid.service.ts` (funzione `processExpiredAuctionsAndAssignPlayers`)
- **Logica:**
  1. Il sistema sblocca i `locked_credits` di **tutti i partecipanti** all'asta che avevano un auto-bid attivo, disattivandoli (`is_active = FALSE`).
  2. Per il **vincitore**, il `current_budget` viene ridotto del **prezzo finale di acquisto**.

---

## Esempio Pratico

**Scenario:**

- Asta per "Player Z".
- **Utente A** imposta un **auto-bid** con un massimo di **20**.
- **Utente B** imposta un **auto-bid** con un massimo di **50**.

| Evento                 | Azione del Sistema                  | `locked_credits` Utente A | `locked_credits` Utente B | Note                                                                                                                                                                                                                                 |
| :--------------------- | :---------------------------------- | :------------------------ | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. **Set Auto-Bid A**  | Utente A imposta auto-bid a 20.     | **20**                    | 0                         | I crediti di A vengono bloccati sulla sua promessa.                                                                                                                                                                                  |
| 2. **Set Auto-Bid B**  | Utente B imposta auto-bid a 50.     | **20**                    | **50**                    | Anche i crediti di B vengono bloccati.                                                                                                                                                                                               |
| 3. **Offerta Esterna** | Utente C offre 21.                  | **0**                     | **50**                    | L'offerta di C (21) supera il `max_amount` di A (20). L'auto-bid di A viene disattivato e i suoi 20 crediti sono **immediatamente sbloccati**. L'auto-bid di B (50) risponde e l'offerta sale a 22. I crediti di B restano bloccati. |
| 4. **Fine Asta**       | Utente B vince il giocatore per 35. | **0**                     | **0**                     | La promessa di B è sciolta. I 50 crediti vengono sbloccati e il suo budget reale viene ridotto di 35.                                                                                                                                |

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

## Gestione delle Penalità

La logica delle penalità è **separata e indipendente** da quella dei crediti bloccati.

- **Azione**: Le penalità vengono sottratte direttamente dal `current_budget` dell'utente.
- **Logica**: Il servizio `penalty.service.ts` applica la deduzione e registra una transazione di tipo `penalty_requirement` nella tabella `budget_transactions`.
- **Impatto UI**: Il budget visualizzato è già al netto delle penalità. I `locked_credits` non includono le penalità. Il budget disponibile (`currentBudget - lockedCredits`) è quindi sempre un riflesso accurato della capacità di spesa.

