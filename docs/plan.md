## Piano d’azione

| ID | Intervento                                   | Relazione                  | Complessità | Priorità |
| -- | -------------------------------------------- | -------------------------- | ----------- | -------- |
| A1 | Correggere query Activity Log                | Indipendente               | Bassa       | Alta     |
| A2 | Test Activity Log con DB reale               | Dipende da A1              | Media       | Alta     |
| B1 | Separare payload realtime pubblico e privato | Base degli altri punti B   | Media       | Critica  |
| B2 | Proteggere il flusso rilancio/auto-bid       | Dipende da B1              | Alta        | Critica  |
| B3 | Proteggere il flusso abbandono               | Dipende da B1              | Media       | Critica  |
| B4 | Aggiornare automaticamente i crediti UI      | Dipende da B2/B3           | Media       | Alta     |
| B5 | Aggiornare gli auto-bid personali            | Dipende da B2              | Media       | Alta     |
| B6 | Test di sicurezza e realtime                 | Dipende da tutti i punti B | Alta        | Critica  |
| C1 | Smoke test finale                            | Dipende da A e B           | Bassa       | Critica  |

### A1. Ripristinare Activity Log

File:

`src/app/api/leagues/[league-id]/activity-log/route.ts`

Sostituire la CTE errata con:

```sql
WITH league_bid_auctions AS MATERIALIZED (
  SELECT id, player_id
  FROM auctions
  WHERE auction_league_id = ?
)
```

La query potrà quindi usare correttamente:

```sql
f.id
f.player_id
```

Questo intervento è completamente indipendente dai problemi realtime.

### A2. Test Activity Log reale

Creare un test con libSQL/SQLite in-memory che inserisca:

* lega;
* due partecipanti;
* giocatore;
* asta;
* almeno un rilancio.

Il test deve eseguire la vera query e verificare:

* `200` per un partecipante;
* eventi restituiti;
* `403` per un utente esterno;
* paginazione senza duplicati.

Non utilizzare mock per `db.execute`, perché non rilevano errori SQL.

### B1. Definire due contratti realtime

Evento pubblico `auction-update`, destinato a:

```text
league-${leagueId}
```

Deve contenere soltanto:

```ts
{
  playerId;
  newPrice;
  highestBidderId;
  highestBidderName;
  scheduledEndTime;
  action?;
  autoBidCount?;
  newBid?;
}
```

Non deve contenere:

```ts
budgetUpdates
locked_credits
newLockedCredits
autoBids
maxAmount
```

Creare un evento privato, ad esempio:

```text
user-auction-private-update
```

destinato esclusivamente a:

```text
user-${userId}
```

Payload:

```ts
{
  leagueId;
  playerId;
  currentBudget;
  lockedCredits;
  autoBid?: {
    maxAmount;
    isActive;
  };
}
```

### B2. Proteggere rilancio e auto-bid

File:

`src/lib/db/services/bid.service.ts`

Durante la stessa transazione:

1. Inserire l’evento pubblico senza informazioni private.
2. Per ogni utente finanziariamente coinvolto, inserire un evento privato nella relativa stanza personale.
3. Inviare il massimale auto-bid solamente al proprietario.
4. Effettuare il commit dopo aver scritto entrambi gli eventi nell’outbox.

Aggiornare in:

`src/lib/db/services/event-outbox.service.ts`

il tipo `OutboxEventType` aggiungendo:

```ts
| "user-auction-private-update"
```

Non è necessaria una migrazione perché `event_type` è una colonna testuale senza vincolo enum.

### B3. Proteggere l’abbandono

File:

`src/lib/db/services/response-timer.service.ts`

L’attuale evento pubblico di abbandono contiene `budgetUpdates`.

Modificarlo così:

* evento pubblico `auction-update`: solamente stato e prezzo dell’asta;
* evento privato `user-auction-private-update`: crediti dell’utente che ha abbandonato;
* preferibilmente entrambi inseriti nell’outbox prima del commit.

Questo punto è collegato a B1, ma indipendente dall’implementazione specifica del rilancio B2.

### B4. Aggiornare automaticamente i crediti

File:

`src/app/auctions/AuctionPageContent.tsx`

Registrare:

```ts
socket.on("user-auction-private-update", handlePrivateUpdate);
```

Nel callback:

```ts
setManagers((previous) =>
  previous.map((manager) =>
    manager.user_id === userId
      ? {
          ...manager,
          current_budget: data.currentBudget,
          locked_credits: data.lockedCredits,
        }
      : manager
  )
);
```

Rimuovere la gestione di `budgetUpdates` dall’evento pubblico.

Il normale `auction-update` continuerà ad aggiornare prezzo, vincitore e timer.

### B5. Aggiornare gli auto-bid personali

File:

`src/app/players/PlayerSearchInterface.tsx`

Non utilizzare più `data.autoBids` proveniente dalla stanza di lega.

Aggiornare `userAutoBid` esclusivamente tramite:

```text
user-auction-private-update
```

In alternativa, dopo l’evento privato ricaricare:

```text
/api/leagues/{leagueId}/auto-bids
```

La prima soluzione è più efficiente.

Inoltre, non eseguire:

```ts
socket.emit("leave-user-room")
```

dal cleanup di `AuctionPageContent`: la stanza personale è gestita globalmente da `SocketContext`. Altrimenti, dopo un cambio lega, gli eventi privati potrebbero non arrivare più.

### B6. Test obbligatori

Aggiungere test che garantiscano:

1. Il payload `league-*` non contiene:

```text
maxAmount
lockedCredits
newLockedCredits
budgetUpdates
autoBids
```

1. Ogni payload privato è indirizzato solo a `user-${userId}`.
2. L’utente A non riceve aggiornamenti finanziari dell’utente B.
3. Un rilancio aggiorna automaticamente prezzo e crediti.
4. L’abbandono aggiorna automaticamente i crediti.
5. Il cambio lega non rimuove la socket dalla stanza personale.
6. Gli eventi privati persi vengono recuperati tramite outbox.
7. I test usano il database reale almeno per query e outbox; evitare semplici controlli regex sul sorgente.

### C1. Verifica conclusiva

Eseguire:

```bash
pnpm lint --max-warnings 0
pnpm type-check
pnpm test:run
pnpm build
```

Smoke test con due account:

1. Account A imposta auto-bid.
2. Account B rilancia.
3. A e B vedono prezzo e crediti aggiornati senza refresh.
4. B non vede il massimale di A nei DevTools.
5. Activity Log è accessibile a entrambi.
6. Un utente esterno alla lega riceve `403`.

Ordine consigliato: **A1 → A2**, poi separatamente **B1 → B2/B3 → B4/B5 → B6**, infine **C1**.

