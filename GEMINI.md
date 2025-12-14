# Fantavega Project - Agent Guidelines

## Project Overview

Fantavega is a fantasy football (soccer) auction system built with Next.js 15, TypeScript, and real-time features.

## Database Management

- **Database**: Turso (Remote Cloud Database)
- Use `pnpm run db:reset` to reset database (Connects to Turso via .env)
- Use `pnpm run db:migrate` to apply schema changes (Connects to Turso via .env)
- Use `pnpm run db:seed` to populate with test data
- **Note**: Ensure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set in `.env` for all operations. Local SQLite file is no longer used.

## Key Architecture Patterns

1. **Server Components** for data fetching and authentication
2. **Client Components** for interactivity and real-time features
3. **Server Actions** for mutations and business logic
4. **Service Layer** in `src/lib/db/services/` for database operations
5. **Socket.IO** for real-time updates

## API Endpoints Structure

- `/api/user/*` - User-specific endpoints
- `/api/leagues/[league-id]/*` - League-specific endpoints
- `/api/admin/*` - Admin-only endpoints

## Authentication & Authorization

- Uses Clerk for authentication
- Role-based access: `admin` and `manager`
- User metadata stored in `user.publicMetadata.role`

## Real-time Features

- Socket.IO server runs on separate process
- WebSocket events for auction updates, bid notifications
- Client-side Socket context for real-time UI updates

## Component Organization

- `src/components/ui/` - Reusable UI components (shadcn/ui)
- `src/components/auction/` - Auction-specific components
- `src/components/players/` - Player management components
- `src/components/admin/` - Admin-only components

## Auto-Bid System Logic

### Core Components

1. **Auto-Bid Storage**: `auto_bids` table stores user preferences per auction

   - `auction_id`: Links to specific player auction
   - `user_id`: The bidder setting the auto-bid
   - `max_amount`: Maximum amount user is willing to bid
   - `is_active`: Boolean flag to enable/disable

2. **Auto-Bid Management API**: `/api/leagues/[league-id]/players/[player-id]/auto-bid`

   - POST: Set/update auto-bid with max amount (0 to disable)
   - GET: Retrieve current auto-bid settings
   - Validates budget availability and auction status

3. **Auto-Bid Activation Logic** (in `bid.service.ts`):
   - Triggered when someone places a bid <= current highest bid
   - Checks for active auto-bids with max_amount > current bid
   - Automatically places bid at (attempted_bid + 1) if auto-bid can cover it
   - Updates auction state and sends real-time notifications

### Auto-Bid Flow

1. User sets auto-bid via QuickBidModal or AutoBidModal components
2. When another user bids, system checks for competing auto-bids
3. If auto-bid exists and can cover the new bid amount + 1, it activates
4. Auto-bid places new bid automatically and updates locked credits
5. Real-time notifications sent to all league participants

## Penalty System Logic

### Core Components

1. **Compliance Tracking**: `user_league_compliance_status` table

   - Tracks compliance timer per user/league/phase
   - Records penalty application history
   - Manages grace periods and penalty cycles

2. **Compliance Check API**: `/api/leagues/[league-id]/check-compliance`

   - POST endpoint for users to trigger their own compliance check
   - Validates user participation in league
   - Calls `processUserComplianceAndPenalties` service

3. **Penalty Logic** (in `penalty.service.ts`):
   - Calculates required slots minus one for active auction roles
   - Counts covered slots (assigned players + winning bids)
   - Applies 1-hour grace period before penalties start
   - Deducts 5 credits per hour of non-compliance (max 5 penalties per cycle)
   - Resets penalty cycle when user becomes compliant

### Penalty Flow

1. System checks if user meets minimum roster requirements
2. If non-compliant, starts 1-hour grace period timer
3. After grace period, applies 5-credit penalties hourly
4. Penalties recorded in budget_transactions table
5. Real-time notifications sent to penalized user
6. Cycle resets when user becomes compliant

## Development Guidelines

- Always verify user authentication and roles
- Use TypeScript interfaces for data structures
- Implement proper error handling and loading states
- Follow responsive design patterns (mobile-first)
- Use real-time updates where appropriate

## Testing

- Test with both admin and manager roles
- Verify responsive design on different screen sizes
- Test real-time features with multiple browser tabs
- Validate API endpoints with proper authentication
- Test auto-bid activation with multiple competing bids
- Verify penalty system with non-compliant roster configurations

## 1. prima di iniziare a scrivere codice, in caso di dubbi o possibilità multiple di sviluppo, fai domande chiare e solo dopo avere le risposte inizia la modifica del codice

## 2. Riferimenti Tecnici del Progetto

### 2.1. Panoramica del Progetto

Fantavega è un sistema di asta per fantacalcio basato su Next.js 15. Gestisce leghe di fantacalcio attraverso aste competitive con offerte in tempo reale, gestione budget, sistemi di penalità automatici e amministrazione della lega.

**Nome Progetto**: Fantavega - Fantacalcio Auction System
**Obiettivo Progetto**: Sviluppare una piattaforma d'asta per il fantacalcio con gestione di leghe/stagioni, aste per singoli giocatori con timer e reset, offerte manuali/quick, gestione budget per manager, e funzionalità di riparazione.

### 2.2. Stack Tecnologico

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



### 2.3. Struttura Directory Chiave

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

### 2.4. Gestione Database

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

### 2.5. Logica di Dominio e Flussi

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
