# PR 4: test E2E delle sessioni e dei timer

## Titolo

`test(e2e): cover hard-close, lazy logout, reconnect and timer activation`

## Obiettivo

Bloccare le regressioni sul comportamento business: un utente offline non deve consumare il timer, mentre un utente che torna online deve ricevere esattamente 60 minuti per decidere.

## Scenari obbligatori

1. Utente2 riceve un rilancio mentre offline: timer `pending`, `response_deadline IS NULL`.
2. Utente2 chiude brutalmente il browser: nessun heartbeat successivo, logout Socket.IO entro 10 secondi oppure reaper entro 120 secondi.
3. Utente2 torna dopo il logout: nuova sessione, timer attivato con `activated_at` uguale al ritorno e deadline `+3600` secondi.
4. Utente2 si riconnette entro 10 secondi: il callback vecchio non chiude la nuova sessione.
5. Utente2 mantiene una tab HTTP attiva ma perde WebSocket: il heartbeat impedisce il logout forzato.
6. Due tab fanno polling insieme: un solo claim e una sola notifica.
7. Il timer scade: una sola transizione, un solo cooldown e una sola riga ledger.
8. Logout lazy senza heartbeat: dopo la finestra prevista l'utente non risulta piÃ¹ online e non riceve un timer attivo.

## Implementazione

Aggiungere `pnpm test:e2e` se non esiste, mockando Clerk e il database ai confini esterni. Tenere anche uno smoke test browser reale per hard-close e reconnect, perchÃ© nessun mock verifica davvero il comportamento del browser e di Socket.IO.

## Criteri di accettazione

- mai `response_deadline` valorizzato su un utente senza heartbeat fresco;
- mai piÃ¹ di una transizione terminale per timer;
- il deadline di ritorno Ã¨ calcolato dal heartbeat accettato dal server;
- un callback Socket.IO ritardato non puÃ² chiudere una sessione con heartbeat piÃ¹ recente;
- il timer resta attivo per circa 60 minuti e l'abbandono automatico avviene solo dopo la scadenza.
