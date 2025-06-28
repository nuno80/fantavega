{
"last_update": "2024-06-28T17:50:00Z",
"files": [
{
"path": "socket-server.ts",
"description": "Server Node.js autonomo con Socket.IO che gestisce le connessioni e le stanze per le notifiche in tempo reale."
},
{
"path": ".eslintrc.json",
"description": "Configura le regole di linting per il progetto per mantenere la coerenza del codice."
},
{
"path": "next.config.mjs",
"description": "File di configurazione per Next.js, dove vengono definite le impostazioni del server, delle immagini e altre ottimizzazioni."
},
{
"path": "package.json",
"description": "Elenca le dipendenze del progetto e gli script per l'esecuzione di comandi come build, dev e test."
},
{
"path": "database/schema.sql",
"description": "Script SQL per la definizione dello schema del database, incluse tabelle, relazioni e indici."
},
{
"path": "Docker/docker-compose.yml",
"description": "File di configurazione per Docker Compose per orchestrare i container dell'applicazione e del database."
},
{
"path": "src/middleware.tsx",
"description": "Middleware che intercetta le richieste per gestire l'autenticazione e l'autorizzazione usando Clerk."
},
{
"path": "src/app/layout.tsx",
"description": "Layout radice dell'applicazione, che include il SocketProvider e il Toaster per le notifiche."
},
{
"path": "src/types/globals.d.ts",
"description": "Estende le interfacce globali di Clerk per garantire la type safety sui ruoli utente."
},
{
"path": "src/contexts/SocketContext.tsx",
"description": "React Context Provider per gestire e distribuire la connessione Socket.IO nell'applicazione client."
},
{
"path": "src/components/auction/AuctionRealtimeDisplay.tsx",
"description": "Componente client che visualizza i dati di un'asta e si aggiorna in tempo reale tramite Socket.IO."
},
{
"path": "src/lib/socket-emitter.ts",
"description": "Funzione helper per inviare eventi dal backend Next.js al server Socket.IO in modo sicuro."
},
{
"path": "src/lib/db/services/auction-league.service.ts",
"description": "Servizio di business per la gestione delle leghe e dei partecipanti."
},
{
"path": "src/lib/db/services/bid.service.ts",
"description": "Servizio core per la gestione delle offerte e delle aste, integrato con le notifiche in tempo reale."
},
{
"path": "src/lib/db/services/budget.service.ts",
"description": "Servizio di business per la gestione del budget e delle transazioni dei team."
},
{
"path": "src/lib/db/services/player.service.ts",
"description": "Servizio di business per la gestione dei dati dei giocatori (CRUD, ricerca)."
},
{
"path": "src/lib/db/services/player-import.service.ts",
"description": "Servizio per la logica di parsing di file Excel e l'aggiornamento (UPSERT) dei giocatori nel database."
},
{
"path": "src/lib/db/services/penalty.service.ts",
"description": "Servizio per la logica del sistema di penalità, integrato con le notifiche in tempo reale."
},
{
"path": "src/lib/db/services/admin.service.ts",
"description": "Servizio per le funzionalità accessibili solo agli amministratori, come la gestione utenti."
},
{
"path": "src/app/api/admin/leagues/route.ts",
"description": "Route API per la creazione e la gestione delle leghe da parte dell'admin."
},
{
"path": "src/app/api/admin/players/route.ts",
"description": "Route API per la gestione dei giocatori (CRUD) da parte dell'admin."
},
{
"path": "src/app/api/admin/players/upload-excel/route.ts",
"description": "Route API per l'upload di file Excel per l'importazione massiva di giocatori."
},
{
"path": "src/app/api/admin/get-users/route.ts",
"description": "Route API per ottenere la lista di tutti gli utenti registrati."
},
{
"path": "src/app/api/admin/set-user-role/route.ts",
"description": "Route API per impostare o modificare il ruolo di un utente."
},
{
"path": "src/app/api/admin/tasks/process-auctions/route.ts",
"description": "Route API per avviare task di elaborazione delle aste concluse."
},
{
"path": "src/app/api/leagues/[league-id]/...",
"description": "Route API per le interazioni dei manager con una lega specifica (es. offerte, visualizzazione rose)."
},
{
"path": "src/app/api/players/route.ts",
"description": "Route API pubblica per la ricerca e la visualizzazione dei giocatori."
}
]
}
