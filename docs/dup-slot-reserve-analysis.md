# Analisi — Deduplica del calcolo "slot occupati / riserva crediti" in `bid.service.ts`

Data: 2026-08-29 · Stato: **in attesa di decisione** (nessuna modifica applicata)

---

## 1. Il problema in una frase

Lo **stesso calcolo** ("quanti slot ho già occupati → quanti ne restano → 1 credito di riserva per ognuno") è scritto **due volte** in `bid.service.ts`, e le due copie **producono risultati diversi per la stessa azione**.

---

## 2. Le due copie

### Copia A — `checkSlotsAndBudgetOrThrow` (righe ~178-232)
Valida l'offerta **manuale** (nuova asta o rilancio).

```sql
SELECT COUNT(*) FROM auctions
WHERE auction_league_id = ? AND current_highest_bidder_id = ?
  AND status IN ('active','closing')
  [AND player_id != <asta target>]      -- se è un rilancio: ESCLUDE l'asta su cui agisci
```

Poi:
```
slotsOccupied      = acquisiti + count
slotsRemaining     = isNewAuctionAttempt ? totale - occupati - 1   // -1 perché QUESTA offerta occuperà uno slot
                                          : totale - occupati        // "slot già contato"
riserva            = max(0, slotsRemaining)
```

### Copia B — `upsertAutoBidAndLockCredits` (righe ~333-420)
Valida il **delta dei locked_credits** quando imposti/aumenti un auto-bid.

```sql
SELECT COUNT(*) FROM auctions
WHERE auction_league_id = ? AND current_highest_bidder_id = ?
  AND status IN ('active','closing')    -- NESSUNA esclusione
```

Poi:
```
slotsOccupied  = acquisiti + count
slotsRemaining = totale - occupati
riserva        = max(0, slotsRemaining)
```

---

## 3. Perché le due copie divergono (esempio concreto)

Lega da 25 slot. Mario: 11 giocatori acquisiti, è miglior offerente su 3 aste attive (X=20, Y=15, Z=25). Rilancia su **X** a 25 e imposta auto-bid max **50**.

| | Copia A (rilancio su X) | Copia B (auto-bid) | Stato vero |
|---|---|---|---|
| Aste vincenti contate | 2 (Y,Z — X **esclusa**) | 3 (X,Y,Z) | 3 |
| Slot occupati | 11+2 = **13** | 11+3 = **14** | **14** |
| Slot rimanenti | 25−13 = **12** | 25−14 = **11** | **11** |
| **Riserva** | **12** | **11** | **11** |

- **B è esatto** secondo la regola prodotto: *"se qualcuno rilancia un mio calciatore lo slot del mio team resta occupato finché abbandono o scade il timer 1h"*. Mario già vince X → lo slot di X è **già occupato** → si riserva solo per i vuoti veri.
- **A soprariserva di 1** (12 invece di 11): esclude X dal conteggio ma poi non compensa (il suo commento "slot già contato" vale solo se X resta nel conteggio). Conseguenza: A può **respingere** un'offerta che B avrebbe accettato — la stessa azione giudicata con due misure diverse.

---

## 4. La regola prodotto (come dichiarata)

> Lo slot si occupa: 1) quando avvii un'asta; 2) se qualcuno rilancia un tuo calciatore, lo slot resta occupato finché a) abbandoni, o b) scade il timer di risposta (1h). Se decidi di continuare, resta bloccato.

Tradotta in conteggio:
- Slot occupati = **acquisiti** + **aste attive dove sei attualmente miglior offerente** + **aste dove sei stato superato ma hai un timer di risposta pendente** (puoi ancora rilanciare).
- Riserva = max(0, slotTotali − slotOccupati − (1 se questa azione crea un NUOVO slot occupato)).

---

## 5. Cosa non va nel codice attuale (3 problemi)

### P1 — Duplicazione + incoerenza
Due copie dello stesso calcolo con risultati diversi (sez. 3). La copia A non è allineata alla regola prodotto; la copia B sì.

### P2 — I "superati con timer pendente" NON sono contati
Il conteggio attuale usa solo `current_highest_bidder_id` (chi è winner ORA). Un utente **superato con timer pendente** (può ancora rilanciare entro 1h) **non è** winner attuale → il suo slot risulta **libero**. Ma secondo la regola è **occupato**. Rischio: l'utente riempie quegli slot con altri acquisti e poi non ha slot per rilanciare (o viceversa: il sistema gli permette di impegnarsi oltre la capienza).

### P3 — Il conteggio "superati" è fragile se aggiunto a mano
Se aggiungessimo i timer pendenti in **entrambe** le copie, la divergenza peggiorerebbe (3 copie dello stesso pezzo). Va fatto in **un solo posto**.

---

## 6. Proposta (3 opzioni, dalla più semplice alla più completa)

### Opzione 1 — Solo deduplica (minimo, zero rischio)
Estrarre un'unica funzione:
```
computeReservedCredits(tx, league, userId, isNewAuctionAttempt, currentAuctionTargetPlayerId?)
  → { slotsOccupied, slotsRemaining, reserve }
```
e farla chiamare da A e da B **con la stessa semantica** (B è quella giusta: niente esclusione dell'asta target quando l'utente la vince già; il flag resta per le nuove aste). Nessun cambiamento di comportamento rispetto a B; A si allinea a B.

**Rischio:** basso. **Test:** il delta locked_credits dell'auto-bid resta identico; l'offerta manuale ora usa lo stesso conteggio (in pratica A si corregge verso B: può accettare 1 credito in più alla frontiera).

### Opzione 2 — Deduplica + correzione timer pendenti (consigliata)
Opzione 1, **più**: nel conteggio degli slot occupati, aggiungere anche le aste con **timer di risposta pendente** (`user_auction_response_timers.status='pending'`, deadline non scaduta) — così la regola prodotto diventa vera anche per chi è stato superato.

**Rischio:** medio — tocca la logica di slot per tutti. Serve test: rilancio su asta già vinta, nuova asta, superato con timer pendente (slot occupato), timer scaduto (slot libero), e scenario manuale.

### Opzione 3 — Opzione 2 + contabilità per ruolo
In più, allineare anche il **controllo slot per ruolo** (oggi in A ma non in B: `slotsVirtuallyOccupiedByOthers` per ruolo) con la stessa logica, così anche i "superati con timer pendente" contano nel ruolo.

**Rischio:** medio-alto. Da valutare solo se il controllo per ruolo deve riflettere gli stessi impegni.

---

## 7. Raccomandazione

**Opzione 2.** Motivo: la deduplica da sola (opzione 1) allinea A a B, ma lascia il buco P2 (timer pendenti non contati), che è proprio la tua regola prodotto. L'opzione 2 risolve entrambi in un unico punto di verità, con rischio gestibile e test dedicati.

**Prossimo passo se approvi:** 1) scrivere test che bloccano la semantica attesa (i 4 casi sopra); 2) estrarre `computeReservedCredits` e allineare A e B; 3) aggiungere i timer pendenti al conteggio; 4) scenario manuale (rilancio + auto-bid + settlement → locked_credits e budget coerenti).
