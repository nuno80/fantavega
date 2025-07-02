{
  "last_update": "2024-07-02T12:05:00Z",
  "files": [
    {
      "path": "socket-server.ts",
      "description": "Server Node.js autonomo con Socket.IO che gestisce le connessioni e le stanze per le notifiche in tempo reale."
    },
    {
      "path": "database/schema.sql",
      "description": "Schema del database. Aggiornato per semplificare il CHECK constraint della colonna 'status' delle leghe."
    },
    {
      "path": "src/lib/db/seed.ts",
      "description": "Script di seeding, aggiornato per allinearsi alle modifiche dello schema del database."
    },
    {
      "path": "src/app/admin/leagues/[leagueId]/dashboard/page.tsx",
      "description": "Pagina della dashboard di gestione per una lega, che mostra statistiche, partecipanti e controlli di gestione."
    },
    {
      "path": "src/components/admin/LeagueStatusManager.tsx",
      "description": "Componente client per la gestione e l'aggiornamento dello stato di una lega."
    },
    {
      "path": "src/components/forms/CreateLeagueForm.tsx",
      "description": "Componente client per il form di creazione lega, gestito con useActionState."
    },
    {
      "path": "src/components/forms/AddParticipantForm.tsx",
      "description": "Componente client con un dialogo per aggiungere nuovi partecipanti a una lega."
    },
    {
      "path": "src/lib/actions/league.actions.ts",
      "description": "Contiene le Server Actions per creare una lega, aggiungere partecipanti e aggiornarne lo stato."
    },
    {
      "path": "src/lib/db/services/auction-league.service.ts",
      "description": "Servizio di business per la gestione delle leghe, dei partecipanti e per l'aggiornamento dello stato."
    },
    {
      "path": "src/lib/db/services/user.service.ts",
      "description": "Servizio per ottenere dati utente, inclusa la lista di utenti idonei per una lega."
    }
  ]
}