# Guida per Gemini: Sviluppo del Progetto Fantavega

Questo file contiene le direttive e il contesto tecnico per lo sviluppo del progetto Fantavega. Segui queste istruzioni con la massima priorità.

## 1. Regole Fondamentali e Workflow Obbligatorio

# Guida Architettonica e di Stile v3.0 per lo Sviluppo di Questa Applicazione Next.js 15

Sei il mio assistente AI esperto per lo sviluppo di questa applicazione Next.js. Ogni singolo pezzo di codice, componente o logica che generi **DEVE** aderire scrupolosamente e senza eccezioni alle seguenti regole e best practice. Questo documento è la nostra "single source of truth" per la qualità del codice e le performance.

---

### **Principi Guida: Server-First, Performance by Default e Sicurezza by Design**

L'architettura di questa applicazione si basa su tre pilastri non negoziabili:

1. **Server-First:** Eseguire il massimo del codice sul server per minimizzare il JavaScript client-side.
2. **Performance by Default:** Sfruttare attivamente il Partial Pre-rendering, lo streaming, il caching e l'ottimizzazione degli asset per garantire un'esperienza utente fulminea.
3. **Sicurezza by Design:** L'autorizzazione e la validazione non sono un'aggiunta, ma parte integrante e fondamentale dell'architettura dati.

---

### **1. Ambiente e Setup del Progetto**

- **Node.js:** Versione 18.18 o successiva.
- **Next.js:** Versione `canary` per abilitare le funzionalità sperimentali come il PPR.
- **Creazione Progetto:** Utilizzare `npx create-next-app@latest` con le seguenti opzioni obbligatorie:
  - TypeScript: **Yes**
  - ESLint: **Yes**
  - Tailwind CSS: **Yes**
  - `src/` directory: **Yes**
  - App Router: **Yes**
  - Customize import alias: **No** (mantenere `@/*` di default)

---

### **2. Architettura dei Componenti: React Server Components (RSC)**

- **Regola Fondamentale:** Tutti i componenti nella directory `app/` sono **Server Components (RSC) per impostazione predefinita**. Questo è l'approccio da privilegiare sempre.
- **Client Components:** Vanno usati **solo quando strettamente necessario** per l'interattività (hooks, eventi). Richiedono la direttiva `"use client";` all'inizio del file. L'interattività deve essere isolata nel componente foglia più piccolo possibile.

---

### **3. Routing, Layouts e Performance**

- **Regola Critica:** Il data fetching lato server in un file `layout.tsx` forza **tutte le route figlie a diventare dinamiche**, annullando i benefici del Rendering Statico (SSG).
- **Soluzione Obbligatoria:** Per elementi UI condivisi che necessitano di dati dinamici (es. sessione utente nella navbar), i dati devono essere recuperati **lato client** seguendo il pattern della Sezione 8.

---

### **4. Ottimizzazione degli Asset: `next/image`**

- L'uso del tag `<img />` standard è **vietato**. Utilizzare sempre il componente `<Image />` da `next/image`.
- **Implementazione:** Fornire sempre gli attributi `width` e `height` per evitare il Layout Shift. I domini per le immagini esterne devono essere autorizzati in `next.config.mjs`.
- **Ottimizzazione LCP:** Per le immagini critiche visibili "above the fold" (es. hero image), aggiungere la prop `priority={true}` per caricarle in via prioritaria e migliorare il Largest Contentful Paint.

---

### **5. Il Data Access Layer (DAL): Standard per l'Interazione con i Dati**

Tutta la logica di interazione con i dati (lettura e scrittura) **deve** essere centralizzata in un Data Access Layer (DAL) nella directory `src/data/`.

- **Struttura:** Organizzare la logica per dominio (es. `src/data/user/`, `src/data/todos/`).
- **Sicurezza con `server-only`:** Ogni file nel DAL che interagisce con il database o usa segreti **deve** importare `'server-only'` all'inizio per prevenire fughe di codice sul client.
- **Regola Fondamentale (Autorizzazione alla Fonte):** La verifica dell'autorizzazione utente **deve** avvenire all'interno della funzione del DAL, prima di qualsiasi interazione con il database. Utilizzare una funzione di utility centralizzata per questo scopo.
- **Deduplicazione con `React.cache()`:** La funzione di utility per l'autorizzazione (`requireUser`) **deve** essere avvolta in `React.cache()` per deduplicare le chiamate all'interno di un singolo render pass.

---

### **6. Strategie di Rendering e Data Fetching per Server Components**

La scelta della strategia di rendering dipende dalla natura del contenuto della pagina.

#### **6.1. Pagine Statiche e con Revalidazione (SSG/ISR)**

- **Utilizzo:** Per pagine il cui contenuto non cambia a ogni richiesta (es. blog, pagine di marketing). Questo è l'approccio di default se non vengono usate API dinamiche.
- **Implementazione:** Non è richiesta alcuna configurazione speciale. Next.js le renderizzerà staticamente in fase di build.

#### **6.2. Pagine Interamente Dinamiche (SSR) con Streaming**

- **Utilizzo:** Per pagine dove l'intera struttura dipende da dati dinamici (es. una pagina di ricerca).
- **Implementazione:** L'uso di funzioni dinamiche (`headers`, `cookies`) o di `fetch` con `{ cache: 'no-store' }` rende l'intera pagina dinamica. In questo caso, usare `<Suspense>` per lo streaming granulare è fondamentale per non bloccare la UI.

#### **6.3. Pagine Ibride: Partial Pre-rendering (PPR)**

- **Utilizzo:** **Questa è la strategia preferita per la maggior parte delle pagine.** È ideale per route che contengono principalmente contenuto statico ma con alcune "isole" di contenuto dinamico.
- **Concetto Chiave:** La pagina viene servita istantaneamente come una shell statica pre-renderizzata (da CDN), mentre le parti dinamiche vengono caricate in streaming.

- **Regola di Implementazione:**
  1. **Abilitazione:** Attivare il flag in `next.config.mjs` e aggiungere `export const experimental_ppr = true;` nel file della pagina.
  2. **Delimitazione:** Avvolgere **esclusivamente** i componenti che fetchano dati dinamici in un tag `<Suspense>`. **Ciò che è fuori da `<Suspense>` diventa la shell statica; ciò che è dentro diventa un "buco" dinamico.**

**Esempio di PPR:**

```tsx
// app/products/[id]/page.tsx
import { Suspense } from "react";

// Statico
import LiveReviews from "@/components/LiveReviews";
import ProductDetails from "@/components/ProductDetails";
// Dinamico
import { ReviewsSkeleton } from "@/components/Skeletons";

// 1. Abilita il PPR per questa pagina
export const experimental_ppr = true;

export default function ProductPage({ params }) {
  return (
    <div>
      {/* Questo componente viene pre-renderizzato e fa parte della shell statica */}
      <ProductDetails productId={params.id} />

      <hr />

      {/* Questa sezione è un "buco" che verrà riempito in streaming */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <LiveReviews productId={params.id} />
      </Suspense>
    </div>
  );
}
```

---

### **7. Data Fetching per Client Components: Il Pattern `React.use()`**

Quando i dati sono necessari per l'interattività, l'uso di `useEffect` per il fetching è un **anti-pattern vietato**. Lo standard è il pattern **"Pass the Promise"**.

- **Workflow Obbligatorio:**
  1. **Inizia il Fetch sul Server (senza `await`):** Nel Server Component genitore, chiama la funzione di fetching del DAL per ottenere una `Promise`.
  2. **Passa la Promise come Prop:** Passa la `Promise` non risolta al Client Component figlio.
  3. **Consuma la Promise con `use()`:** Dentro il Client Component, usa l'hook `React.use(promise)` per leggere il risultato. Il componente **deve** essere avvolto in `<Suspense>`.

---

### **8. Mutazioni Dati: Server Actions**

Le Server Actions sono usate **ESCLUSIVAMENTE per le mutazioni** (create, update, delete). L'uso per il data fetching è severamente vietato.

- **Architettura:** La logica delle Server Action **deve** risiedere nel DAL.
- **Workflow Obbligatorio:** Ogni Server Action **deve** seguire questo schema:
  1. **Definizione:** Il file deve iniziare con `"use server";`.
  2. **Autorizzazione alla Fonte:** Verificare la sessione utente come primo passo.
  3. **Validazione Rigorosa dell'Input:** Usare **Zod** per validare i dati in ingresso.
  4. **Logica di Mutazione Sicura:** Eseguire l'operazione sul DB in un blocco `try...catch`.
  5. **Revalidazione della Cache:** Usare `revalidatePath()` o `revalidateTag()` dopo una mutazione riuscita.
  6. **Feedback alla UI:** Restituire uno stato serializzabile per `useFormState`.

---

### **9. Autenticazione e Sicurezza**

- **Protezione delle Route:** Deve essere gestita tramite **Middleware**. Questo è il modo più efficiente perché preserva il rendering statico delle pagine protette.
- **Accesso ai Dati Utente:**
  - **Lato Server:** Usare le funzioni fornite dal provider di autenticazione (es. `auth()` di Clerk).
  - **Lato Client:** Usare gli hook forniti (es. `useUser()` di Clerk) per non rompere il rendering statico dei layout.

### La Regola d'Oro

L'esecuzione dei task deve seguire **esclusivamente** l'ordine sequenziale definito nel file `tasks.json`. Non passare al task successivo finché quello corrente non è stato completato in tutti i suoi sub-task.

### Ciclo di Lavoro Obbligatorio (Dopo ogni sub-task completato)

Al completamento di **ogni sub-task**, DEVI eseguire i seguenti passi:

2. **Aggiorna i File di Stato**: Una volta superati i controlli, genera e fornisci INSIEME, in un unico messaggio, le versioni aggiornate dei seguenti tre file JSON.

   - **`tasks.json`**: Aggiorna lo stato del sub-task/task completato da "pending" a "completed".
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

**Fase Attuale**: Test delle funzionalità

**Stato**: ✅ **Gestione Crediti TESTATA e FUNZIONANTE**

**Test Effettuati**:

- ✅ **Test rilanci**: Verificato corretto comportamento crediti bloccati durante rilanci successivi (caso Ahanor)
- ✅ **Test abbandono aste**: Verificato che non si generano più crediti negativi quando si abbandona un'asta
- ✅ **Test auto-bid vs manual bid**: Verificata coerenza tra auto-bid attivi e crediti bloccati
- ✅ **Test aste concluse**: Verificato che auto-bid vengano disattivati correttamente su aste concluse
- ✅ **Bug fix applicato**: Risolto problema doppio rilascio crediti nel `bid.service.ts`

**Requisiti Chiave**:

- Sistema di gestione crediti robusto e coerente
- Prevenzione crediti negativi
- Corretto blocco/sblocco crediti durante le aste

**Funzionalità Testate e Funzionanti**:

- ✅ **Gestione Crediti**: Sistema completamente testato e funzionante
- ✅ **Rilanci**: Gestione corretta dei crediti durante rilanci multipli
- ✅ **Auto-bid**: Blocco/sblocco automatico crediti per auto-bid
- ✅ **Aste concluse**: Pulizia automatica auto-bid su aste terminate

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
- `database/schema.sql`: Schema SQL per il database, includendo le tabelle, indici e vincoli.
- `database/starter_default.db`: Database starter con schema predefinito.

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
