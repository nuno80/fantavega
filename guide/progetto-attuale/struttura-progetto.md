{
"last_update": "2024-05-24T15:20:00Z",
"files": [
{
"path": "socket-server.ts",
"description": "Server Node.js autonomo con Socket.IO che gestisce le connessioni e le stanze per le notifiche."
},
{
"path": ".eslintrc.json",
"description": "Configura le regole di linting per il progetto."
},
{
"path": "src/app/layout.tsx",
"description": "Layout radice dell'applicazione, che include il SocketProvider e il Toaster per le notifiche."
},
{
"path": "src/middleware.ts",
"description": "Intercetta le richieste per gestire autenticazione e autorizzazione usando Clerk."
},
{
"path": "src/types/globals.d.ts",
"description": "Estende interfacce globali Clerk per la type safety sui ruoli utente."
},
{
"path": "src/contexts/SocketContext.tsx",
"description": "React Context Provider per gestire e distribuire la connessione Socket.IO nell'applicazione client."
},
{
"path": "src/components/auction/AuctionRealtimeDisplay.tsx",
"description": "Componente client che visualizza i dati di un'asta e si aggiorna in tempo reale."
},
{
"path": "src/lib/socket-emitter.ts",
"description": "Funzione helper per inviare eventi dal backend Next.js al server Socket.IO."
},
{
"path": "src/lib/db/services/auction-league.service.ts",
"description": "Servizio di business per la gestione delle leghe e dei partecipanti."
},
{
"path": "src/lib/db/services/bid.service.ts",
"description": "Servizio core per offerte e aste, integrato con le notifiche real-time."
},
{
"path": "src/lib/db/services/budget.service.ts",
"description": "Servizio di business per la gestione del budget e delle transazioni."
},
{
"path": "src/lib/db/services/player.service.ts",
"description": "Servizio di business per la gestione dei dati dei giocatori (CRUD, ricerca)."
},
{
"path": "src/lib/services/player-import.service.ts",
"description": "Servizio per la logica di parsing di file Excel e l'UPSERT dei giocatori."
},
{
"path": "src/lib/db/services/penalty.service.ts",
"description": "Servizio per la logica del sistema di penalità, integrato con le notifiche real-time."
},
{
"path": "src/app/api/admin/leagues/...",
"description": "Route API per la gestione delle leghe e dei partecipanti da parte dell'admin."
},
{
"path": "src/app/api/leagues/[league-id]/...",
"description": "Route API per le interazioni dei manager con la lega (es. offerte, visualizzazione rose)."
},
{
"path": "src/app/api/admin/players/...",
"description": "Route API per la gestione dei giocatori da parte dell'admin (CRUD, upload Excel)."
},
{
"path": "src/app/api/admin/leagues/[league-id]/rosters/export/csv/route.ts",
"description": "Route API specifica per l'esportazione CSV delle rose di una lega."
},
{
"path": "src/app/api/leagues/[league-id]/check-compliance/route.ts",
"description": "Route API per triggerare il controllo di conformità per le penalità."
}
]
}
