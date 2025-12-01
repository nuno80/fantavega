# Guida per Gemini: Sviluppo del Progetto Fantavega

Questo file contiene le direttive e il contesto tecnico per lo sviluppo del progetto Fantavega. Segui queste istruzioni con la massima priorità.

## 1. Regole Fondamentali e Workflow Obbligatorio


### Ciclo di Lavoro Obbligatorio (Dopo ogni sub-task completato)

Al completamento di **ogni sub-task**, DEVI eseguire i seguenti passi:

2. **Aggiorna i File di Stato**: Una volta superati i controlli, genera e fornisci INSIEME, in un unico messaggio, le versioni aggiornate dei seguenti tre file JSON.

   - **`logica-app.json`**: Aggiorna o crea questo file per documentare la logica implementata.

   ```JSON
       {
     "last_update": "2024-05-23T10:00:00Z",
     "task_completed": "FN-3 - Creazione Nuova Lega",
     "feature_logic": {
       "feature_name": "Creazione Nuova Lega d'Asta",
       "summary": "Implementa il processo che consente a un utente autenticato di creare una nuova lega. Il sistema registra la lega, assegna il creatore come primo partecipante e amministratore, e lo reindirizza alla pagina di gestione della lega.",
       "architectural_pattern": "Form gestito lato client con React Hook Form, validazione dati con Zod, e sottomissione tramite Server Action per una User Experience ottimale e mutazioni dati sicure sul server.",
       "user_flow": [
         "1. L'utente naviga alla pagina '/leagues/create'.",
         "2. Compila il form specificando il nome della lega e il budget iniziale per i partecipanti.",
         "3. Alla sottomissione, il componente client invoca la Server Action `createLeague`.",
         "4. La Server Action valida i dati ricevuti usando lo schema Zod `CreateLeagueSchema`.",
         "5. Se la validazione ha successo, la action interagisce con il database per creare la nuova lega e registrare il partecipante.",
         "6. Al termine, l'utente viene reindirizzato alla pagina della nuova lega (es. '/leagues/123/dashboard')."
       ],
       "core_components_interaction": {
         "src/app/leagues/create/page.tsx": "Pagina contenitore che renderizza il form di creazione.",
         "src/components/forms/CreateLeagueForm.tsx": "Componente Client ('use client') che gestisce lo stato e la validazione del form in tempo reale e chiama la Server Action al submit.",
         "src/lib/actions/league.actions.ts": "File Server-Side ('use server') che contiene la logica di business per creare la lega nel database.",
         "src/lib/validators/league.validators.ts": "Contiene lo schema Zod `CreateLeagueSchema`, usato sia lato client (per feedback immediato) che lato server (per sicurezza)."
       },
       "database_interactions": [
         {
           "table": "auction_leagues",
           "operation": "INSERT",
           "description": "Inserisce una nuova riga con i dati della lega appena creata."
         }
       ]
     }
   }
   ```

   - **`struttura-progetto.json`**: Aggiorna o crea questo file per mappare i file creati o modificati.

   ```JSON
     {
   "last_update": "2024-05-23T10:00:00Z",
   "files": [
     {
       "path": "src/app/leagues/create/page.tsx",
       "description": "Pagina che renderizza il form per la creazione di una lega."
     },
     {
       "path": "src/components/forms/CreateLeagueForm.tsx",
       "description": "Componente client per il form di creazione lega."
     },
     {
       "path": "src/lib/actions/league.actions.ts",
       "description": "Contiene le Server Actions relative alla gestione delle leghe."
     }
   ]
   }
   ```

Attendi la mia conferma prima di procedere con il sub-task successivo.

## 2. Contesto di Sviluppo Attuale

**Fase Attuale**: Completato Task 7 (Real-Time Notification System). L'applicazione ora supporta aggiornamenti live per le aste e notifiche personali via WebSocket, inclusa la notifica per le penalità applicate.

**Stato**: Implementazione del sistema di penalità con un approccio di "lazy evaluation". Il sub-task 5.4 (Applicazione Automatica delle Penalità) è stato completato.

**Requisiti Chiave**:

- L'attivazione della verifica avviene durante le interazioni dell'utente (login, accesso alla pagina dell'asta).
- Periodo di grazia di 1 ora per raggiungere la conformità.
- Penalità di 5 crediti per ogni ora di non conformità.
- Limite massimo di 25 crediti per ciclo di non conformità continuo.
- Calcolo retroattivo per i periodi di inattività dell'utente.
- Integrazione completa con il sistema di transazioni del budget.

**Focus Implementativo**:

1. Completare la logica di business in `penalty.service.ts`.
2. Implementare la tabella `user_league_compliance_status` per il tracciamento.
3. Creare l'endpoint `/api/leagues/[id]/check-compliance/`.
4. Integrare nel frontend i trigger per la verifica della conformità.

## 3. Riferimenti Tecnici del Progetto

### 3.1. Panoramica del Progetto

Fantavega è un sistema di asta per fantacalcio basato su Next.js 15. Gestisce leghe di fantacalcio attraverso aste competitive con offerte in tempo reale, gestione budget, sistemi di penalità automatici e amministrazione della lega.

**Nome Progetto**: Fantavega - Fantacalcio Auction System
**Obiettivo Progetto**: Sviluppare una piattaforma d'asta per il fantacalcio con gestione di leghe/stagioni, aste per singoli giocatori con timer e reset, offerte manuali/quick, gestione budget per manager, e funzionalità di riparazione.

### 3.2. Stack Tecnologico

- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (TypeScript)
- **Database**: BetterSQLite3 (accesso diretto)
- **Autenticazione**: Clerk
- **Real-Time**: Socket.IO
- **Package Manager**: pnpm
- **UI**: shadcn/ui (base per theming), lucide-react (icone), sonner (notifiche)
- **Theming**: next-themes
- **Sviluppo**: Docker & Docker Compose (Node 20 Slim/Debian)
- **Excel Parsing**: xlsx (SheetJS)

### 3.3. Comandi Utili

- `pnpm run dev`: Avvia il server di sviluppo.
- `pnpm run build`: Crea la build di produzione.
- `pnpm run test`: Esegue la suite di test.
- `pnpm run test:watch`: Esegue i test in modalità "watch".
- `pnpm run db:migrate`: Applica lo schema completo del database.
- `pnpm run db:reset`: Resetta il database da un backup.
- `pnpm run db:seed`: Popola il database con dati di test.
- `pnpm run db:backup`: Crea un backup manuale.
- `pnpm run db:apply-changes`: Esegue modifiche SQL ad-hoc.

### 3.4. Struttura Directory Chiave

- `src/app/`: Pagine e API routes (App Router).
- `src/lib/db/services/`: Logica di business (servizi per asta, offerte, budget).
- `src/lib/db/`: Connessione e utility per il database.
- `src/middleware.ts`: Middleware per autenticazione e autorizzazione.
- `database/`: Schema SQL e script di migrazione.
- `docker/`: File di configurazione Docker.

**File e Descrizioni Aggiuntive**:

- `socket-server.ts`: Server Node.js autonomo con Socket.IO che gestisce le connessioni e le stanze per le notifiche.
- `.eslintrc.json`: Configura le regole di linting per il progetto.
- `src/app/layout.tsx`: Layout radice dell'applicazione, che include il SocketProvider e il Toaster per le notifiche.
- `src/middleware.ts`: Intercetta le richieste per gestire autenticazione e autorizzazione usando Clerk.
- `src/types/globals.d.ts`: Estende interfacce globali Clerk per la type safety sui ruoli utente.
- `src/contexts/SocketContext.tsx`: React Context Provider per gestire e distribuire la connessione Socket.IO nell'applicazione client.
- `src/components/auction/AuctionRealtimeDisplay.tsx`: Componente client che visualizza i dati di un'asta e si aggiorna in tempo reale.
- `src/lib/socket-emitter.ts`: Funzione helper per inviare eventi dal backend Next.js al server Socket.IO.
- `src/lib/db/services/auction-league.service.ts`: Servizio di business per la gestione delle leghe e dei partecipanti.
- `src/lib/db/services/bid.service.ts`: Servizio core per offerte e aste, integrato con le notifiche real-time.
- `src/lib/db/services/budget.service.ts`: Servizio di business per la gestione del budget e delle transazioni.
- `src/lib/db/services/player.service.ts`: Servizio di business per la gestione dei dati dei giocatori (CRUD, ricerca).
- `src/lib/services/player-import.service.ts`: Servizio per la logica di parsing di file Excel e l'UPSERT dei giocatori.
- `src/lib/db/services/penalty.service.ts`: Servizio per la logica del sistema di penalità, integrato con le notifiche real-time.
- `src/app/api/admin/leagues/...`: Route API per la gestione delle leghe e dei partecipanti da parte dell'admin.
- `src/app/api/leagues/[league-id]/...`: Route API per le interazioni dei manager con la lega (es. offerte, visualizzazione rose).
- `src/app/api/admin/players/...`: Route API per la gestione dei giocatori da parte dell'admin (CRUD, upload Excel).
- `src/app/api/admin/leagues/[league-id]/rosters/export/csv/route.ts`: Route API specifica per l'esportazione CSV delle rose di una lega.
- `src/app/api/leagues/[league-id]/check-compliance/route.ts`: Route API per triggerare il controllo di conformità per le penalità.

### 3.5. Gestione Database

- **Schema**: Definito in `database/schema.sql`.
- **Migrazioni**: Applicare lo schema completo con `pnpm run db:migrate`.
- **Modifiche Ad-Hoc**: Aggiungere SQL a `database/adhoc_changes.sql` e lanciare `pnpm run db:apply-changes`. Svuotare il file dopo l'applicazione.
- **Connessione DB**: `src/lib/db/index.ts` (singleton pattern, crea DB file se non esiste).

**Schema Entità Core**:

- `users`: Estende utenti Clerk con `role` ('admin', 'manager') e `status`.
- `players`: Catalogo giocatori.
- `auction_leagues`: Configurazione della lega d'asta.
- `league_participants`: Associazione utenti a leghe. Traccia `current_budget`, `locked_credits`, etc.
- `auctions`: Asta per un singolo giocatore.
- `bids`: Log di ogni offerta.
- `player_assignments`: Traccia l'assegnazione finale di un giocatore a un manager.
- `budget_transactions`: Log delle modifiche al `current_budget`.
- `user_league_compliance_status`: Traccia lo stato di conformità dell'utente ai requisiti di rosa per lega/fase.

### 3.6. Logica di Dominio e Flussi

**Sistema di Notifiche e Aggiornamenti in Tempo Reale**:

- **Nome Feature**: Sistema di Notifiche e Aggiornamenti in Tempo Reale
- **Summary**: Implementa un sistema basato su WebSocket (Socket.IO) per fornire aggiornamenti della UI in tempo reale e notifiche personali.
- **Architectural Pattern**: Pattern a 'Server Dedicato Stateful'. Un server Socket.IO (`socket-server.ts`) gira come processo separato. Il backend Next.js comunica con esso tramite un 'ponte HTTP' per istruirlo su quali eventi emettere.
- **User Flow**:
  1. Al login, il `SocketProvider` stabilisce una connessione WebSocket per l'utente.
  2. Il client si unisce a una 'stanza' personale (es. 'user-user_123') e, in un'asta, alla 'stanza' della lega (es. 'league-456').
  3. Quando un'azione di business avviene (es. offerta, penalità), il servizio corrispondente (`bid.service.ts`, `penalty.service.ts`) chiama `notifySocketServer` dopo aver aggiornato il DB.
  4. `notifySocketServer` invia una richiesta POST al server Socket.IO.
  5. Il server Socket.IO emette gli eventi (`auction-update`, `bid-surpassed-notification`, `penalty-applied-notification`) alle stanze appropriate.
  6. I client connessi ricevono gli eventi, aggiornando la UI e mostrando notifiche toast.
- **Core Components Interaction**:
  - `socket-server.ts`: Server Node.js autonomo con Socket.IO.
  - `src/lib/socket-emitter.ts`: Funzione helper usata dal backend Next.js per comunicare con `socket-server.ts`.
  - `src/lib/db/services/bid.service.ts`: Chiama `notifySocketServer` dopo le operazioni di offerta/chiusura asta.
  - `src/lib/db/services/penalty.service.ts`: Chiama `notifySocketServer` dopo l'applicazione di una penalità.
  - `src/contexts/SocketContext.tsx`: React Context che gestisce il ciclo di vita della connessione socket del client.
  - `src/app/layout.tsx`: Avvolge l'app nel `SocketProvider` per rendere il socket globalmente accessibile.
  - `src/components/auction/AuctionRealtimeDisplay.tsx`: Componente client che usa `useSocket` per ascoltare eventi e aggiornare la UI.

**Sistema di Penalità**:

- **Trigger**: Al login/accesso sezioni chiave asta (approccio 'lazy').
- **Requirement**: Entro 1 ora dal trigger, N-1 slot coperti per ruoli attivi.
- **Penalty Application**: 5 crediti se non conforme dopo 1 ora, con notifica real-time all'utente.
- **Penalty Recurrence**: Ricorrente ogni ora successiva di non conformità.
- **Penalty Cap**: Max 5 penalità (25 crediti) per ciclo di non conformità.
- **Cycle Reset**: Se conforme, contatore penalità azzerato.
- **Tracking Table**: `user_league_compliance_status`.

**Funzionalità Manager Implementate (Backend)**:

- Offerte (iniziali, successive) con gestione `locked_credits`.
- Visualizzazione stato asta giocatore.
- Visualizzazione propria cronologia transazioni budget.
- Visualizzazione propria rosa.
- Trigger (implicito) del controllo di compliance per penalità.
- Ricezione aggiornamenti asta e notifiche (offerte superate, penalità) in tempo reale.

## 4. Standard e Convenzioni

- **Commenti**: In italiano, chiari e concisi per spiegare la logica di business complessa.
- **TypeScript**: Utilizzo estensivo per type safety.
- **Best Practices**: Seguire gli standard di Next.js 15+ (App Router, Server Components, Server Actions).
- **Nomi File**: `*.service.ts`, `*.types.ts`, componenti in PascalCase.
- **Gestione Errori**: Errori tipizzati a livello di servizio, risposte JSON consistenti a livello API.
- **Sicurezza**: Validazione input, query parametrizzate, controllo dei ruoli.

## 5. Testing Commands

### SQLite Direct Testing

Fornire comandi per eseguire query direttamente dal terminale WSL:

Database Path: database/starter_default.db

Command Format: sqlite3 database/starter_default.db "SQL_QUERY"

```bash

# Examples

sqlite3 database/starter_default.db "UPDATE auction_leagues SET status = 'participants_joining' WHERE id = 1;"
sqlite3 database/starter_default.db "SELECT \* FROM users WHERE id = 'user_2ybRb12u9haFhrS4U7w3d1Yl5zD';"
```
