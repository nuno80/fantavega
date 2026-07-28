# Piano di risoluzione ghost session e timer asta

## Decisione architetturale

La scelta del logout forzato dopo la disconnessione WebSocket Ã¨ corretta per il tuo caso d'uso: gli utenti non fanno logout e una sessione fantasma altererebbe l'esito delle aste. Non va rimossa. Va resa condizionale: il WebSocket puÃ² forzare l'offline solo se non esiste una sessione Socket.IO e non Ã¨ arrivato un heartbeat HTTP piÃ¹ recente del disconnect.

La regola finale deve essere:

`online = heartbeat fresco AND sessione aperta`

Il WebSocket Ã¨ un acceleratore per chiudere utenti lazy, non l'unica fonte di veritÃ . Il reaper resta il fallback per crash, hard-close e disconnessioni non osservate.

## Ordine di applicazione

### 1. PR 1, session liveness e forced logout

Applica prima questa PR. Protegge dalla chiusura tardiva della sessione dopo reconnect o heartbeat HTTP. Non cambia la policy lazy logout.

### 2. PR 2, transizioni atomiche

Applica subito dopo. Evita che scheduler, polling e piÃ¹ tab generino doppie attivazioni o doppio abbandono. Se la PR #18 Ã¨ giÃ  stata mergiata, fai solo il confronto file/test e non duplicarla.

### 3. PR 3, heartbeat awaitato

Applica dopo le due protezioni precedenti. Corregge il bug piÃ¹ direttamente collegato al primo ritorno: heartbeat e attivazione diventano una sequenza ordinata e la risposta contiene lo stato aggiornato.

### 4. PR 4, E2E regression

Obbligatoria prima del deploy. Senza questi test il problema tornerÃ  al prossimo refactor del polling o del socket.

## PR giÃ  presenti da non duplicare

- PR #5: chiusura sessioni stale e test liveness, giÃ  mergiata.
- PR #11: usa `max(session_start, last_heartbeat)`, giÃ  mergiata.
- PR #19: rimuove lo sweep globale dal request path, giÃ  mergiata.
- PR #18: contenuto per transizioni atomiche, verificare se presente/mergiata prima di aprire una nuova PR.

## Migrazioni e deployment

1. Applicare la migrazione `last_heartbeat` su Turso prima del codice.
2. Verificare gli indici per sessioni aperte, heartbeat, timer pendenti e timer scaduti.
3. Eseguire test su database pulito e su copia dei dati reali.
4. Deployare prima Socket.IO, poi Next.js, poi eseguire smoke test.
5. Monitorare per almeno un'asta completa: numero sessioni aperte, timer pending senza deadline, timer attivati, cooldown, righe `timer_expired`, p95 degli endpoint.

## Smoke test manuale finale

- Utente1 rilancia a Utente2.
- Chiudere brutalmente il browser di Utente2 prima che visualizzi il rilancio.
- Verificare che il timer resti `pending` senza deadline.
- Attendere il logout forzato o il reaper.
- Riaprire l'asta: verificare un solo timer con `activated_at` al ritorno e deadline a circa +60 minuti.
- Ripetere con reconnect entro 10 secondi e con WebSocket interrotto ma polling HTTP attivo.

## Comandi di rilascio

```bash
pnpm lint
pnpm type-check
pnpm test:run
pnpm test:e2e
pnpm build
```

Non considerare sufficiente un deploy verde: il caso decisivo Ã¨ la combinazione hard-close, reconnect e doppio polling mentre esiste un timer pending.
