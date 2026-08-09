# Fantavega re-audit: verifica post-merge

**Data:** 9 agosto 2026  
**Commit Vercel/source indicato:** `1ec3a2c418bf4ccf334f1ff27b7381044aaab823`  
**Production:** https://fantavega.vercel.app/  
**Repository:** https://github.com/nuno80/fantavega

## Verdetto rapido

Sul commit `1ec3a2c`, il **bug cruciale del timer è corretto nel runtime applicativo**: le due API di polling aggiornano solo l’heartbeat e non chiamano più `activateTimersForUser`; la card `ResponseNeededSlot` chiama l’endpoint scoped `response-timer/viewed` solo per il proprietario.

La correzione è quindi sufficiente contro il bug originale cross-lega, reconnect e polling. Non certifico però ancora il rilascio come completamente verde: il workflow GitHub del commit ha test, schema e invarianti verdi, ma **la production build fallisce**. Il deployment Vercel è raggiungibile, ma una home funzionante non prova che tutte le route protette e il bundle server siano corrette.

## P0: timer avviato al momento sbagliato

### Cosa è corretto

- `src/app/api/user/auction-states/route.ts`: heartbeat awaited, nessuna attivazione globale.
- `src/app/api/leagues/[league-id]/auction-state/route.ts`: autorizzazione lega, heartbeat awaited, nessuna attivazione globale.
- `src/components/auction/ManagerColumn.tsx`: `ResponseNeededSlot` invia `POST /api/leagues/:leagueId/players/:playerId/response-timer/viewed` solo con `isCurrentUser`.
- `response-timer-view.service.ts`: UPDATE condizionale su utente, lega, asta attiva, `status='pending'` e `response_deadline IS NULL`.
- Due tab concorrenti non possono creare due deadline: il secondo claim trova `rowsAffected=0`.
- L’utente di un’altra lega non può attivare il timer perché la route applica `hasLeagueAccess` e il service verifica la lega dell’asta.
- La disconnessione o il reconnect Socket.IO non invocano il claim viewed.

### Rischio residuo P0

La conferma parte al mount React, non da una misura reale di visibilità (`IntersectionObserver`). È accettabile se “card montata” è il contratto prodotto, ma non equivale a “utente l’ha vista”: una card fuori viewport o coperta da un modal può attivare il timer. Se il requisito è letteralmente “vista a schermo”, usare `IntersectionObserver` con soglia almeno 0.5 e un breve dwell time, ad esempio 250 ms.

Secondo rischio: il componente continua a mostrare `Infinity` fino al prossimo polling/socket update dopo il claim. Il database è corretto, ma la UI può ritardare la visualizzazione del countdown. La response del POST viewed dovrebbe aggiornare localmente deadline/state oppure emettere un evento già ascoltato dal parent.

### Accettazione P0

Da eseguire sul commit deployato:

```bash
node scripts/assert-no-legacy-timer-activation.mjs
pnpm type-check
pnpm test:run
pnpm test:e2e
pnpm build
```

Aggiungere un test reale con due timer pending in due leghe: polling della lega A deve lasciare entrambi pending; mount della card A deve attivare solo A. Il test attuale che verifica solo l’assenza della chiamata legacy è necessario ma non sufficiente.

## P1: cooldown e preferenze

Il commit usa `INSERT ... ON CONFLICT DO UPDATE` nei writer principali, quindi non dovrebbe più cancellare preferiti, titolare, integrità o FMV. La verifica deve includere anche il percorso legacy `auction-states.service.ts` e un database creato prima delle colonne `preference_type` ed `expires_at`.

**Rischio ancora aperto:** la migrazione storica `add_user_player_preferences.sql` non è necessariamente allineata allo schema moderno. `CREATE TABLE IF NOT EXISTS` non aggiorna una tabella già esistente. Serve una migration versionata e verificata su un DB legacy reale.

## P1: autorizzazioni admin

Nel commit deployato risultano presenti i controlli `checkIsAdmin` in `updateTeamNameAction`, `updateLeagueStatusAction` e `updateActiveRolesAction`. Il controllo avviene prima delle mutazioni, quindi il bypass dal browser non dovrebbe funzionare.

Manca comunque una matrice test esplicita che dimostri che il non-admin non produce query di scrittura. Aggiungerla prima di chiudere il finding.

## CI e deployment

Il commit `1ec3a2c` ha:

- test: **success**;
- schema/migration audit: **success**;
- SQLite settlement invariants: **success**;
- production build: **failure**.

La dichiarazione “79/79 test verdi” è confermata dal messaggio del commit e dal job Tests, ma non basta per un rilascio certificato finché la build continua a fallire. Prima di promuovere production, recuperare il log della step `Production build`, correggere la causa e rilanciare CI sullo stesso SHA.

## Patch incluse

1. **P0 UI visibility:** opzionale, sostituisce il trigger “mounted” con `IntersectionObserver` e aggiorna il countdown dalla risposta del claim.
2. **P1 schema legacy:** migration versionata per aggiungere `preference_type` ed `expires_at` in modo tracciato.
3. **P1 regression tests:** test cross-lega, due tab e non-admin write guard.

## Conclusione

**Problema 1: risolto lato server e sufficientemente protetto contro l’attivazione cross-lega.** Non lo chiuderei ancora come “production-ready” finché la build GitHub non passa e non esiste un test runtime cross-lega. Il bug non è più nella logica di heartbeat: il punto critico rimasto è provare che solo la card corretta può effettuare il claim.
