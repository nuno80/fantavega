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
{
"last_update": "2024-12-19T15:30:00Z",
"files": [
{
"path": "src/app/admin/leagues/page.tsx",
"description": "Pagina Server Component che visualizza una tabella di tutte le leghe create."
},
{
"path": "src/app/admin/leagues/[leagueId]/dashboard/page.tsx",
"description": "Dashboard di gestione per una lega, che ora include controlli per modificare/rimuovere partecipanti e cambiare lo stato."
},
{
"path": "src/components/admin/LeagueStatusManager.tsx",
"description": "Componente client per la gestione e l'aggiornamento dello stato di una lega."
},
{
"path": "src/components/admin/EditTeamName.tsx",
"description": "Componente client con un popover per modificare il nome della squadra di un partecipante."
},
{
"path": "src/components/admin/RemoveParticipant.tsx",
"description": "Componente client con un dialogo di allerta per rimuovere un partecipante da una lega (solo se lo stato lo permette)."
},
{
"path": "src/components/forms/AddParticipantForm.tsx",
"description": "Componente client con un dialogo per aggiungere nuovi partecipanti a una lega."
},
{
"path": "src/lib/actions/league.actions.ts",
"description": "Contiene tutte le Server Actions per la gestione delle leghe (crea, aggiungi/rimuovi partecipante, aggiorna stato/nome squadra)."
},
{
"path": "src/lib/db/services/auction-league.service.ts",
"description": "Servizio di business per la gestione delle leghe, ora include la logica per modificare nomi squadra e rimuovere partecipanti in sicurezza."
}
]
}
{
"last_update": "2024-12-19T15:30:00Z",
"files": [
{
"path": "src/app/auctions/page.tsx",
"description": "Pagina principale delle aste con autenticazione, controllo ruoli e caricamento del contenuto auction interface."
},
{
"path": "src/app/auctions/AuctionPageContent.tsx",
"description": "Componente Client principale che orchestra l'interfaccia aste live con gestione stato e integrazione Socket.IO."
},
{
"path": "src/components/auction/AuctionPlayerCard.tsx",
"description": "Componente per visualizzare informazioni del giocatore in asta con badge ruolo, immagine e stato."
},
{
"path": "src/components/auction/BiddingInterface.tsx",
"description": "Interfaccia completa per piazzare offerte con validazione budget, offerte rapide e controlli di sicurezza."
},
{
"path": "src/components/auction/AuctionTimer.tsx",
"description": "Timer real-time per aste con countdown, progress bar e avvisi visivi per scadenza."
},
{
"path": "src/components/auction/BidHistory.tsx",
"description": "Cronologia scrollabile delle offerte con evidenziazione utente corrente e tipi di offerta."
},
{
"path": "src/components/auction/BudgetDisplay.tsx",
"description": "Visualizzazione completa del budget utente con progress bar, breakdown dettagliato e avvisi."
},
{
"path": "src/components/auction/AuctionLayout.tsx",
"description": "Layout responsive per le aste con header, navigazione e supporto mobile/desktop."
},
{
"path": "src/components/ui/progress.tsx",
"description": "Componente UI Progress bar basato su Radix UI per visualizzazioni di progresso."
},
{
"path": "src/components/ui/scroll-area.tsx",
"description": "Componente UI ScrollArea basato su Radix UI per aree scrollabili personalizzate."
}
]
}
{
"last_update": "2024-12-19T16:45:00Z",
"files": [
{
"path": "src/app/players/page.tsx",
"description": "Pagina principale per la ricerca e gestione giocatori con autenticazione e controllo ruoli."
},
{
"path": "src/app/players/PlayerSearchInterface.tsx",
"description": "Componente Client principale che orchestra ricerca, filtri, risultati e gestisce aggiornamenti real-time."
},
{
"path": "src/components/players/PlayerSearchBar.tsx",
"description": "Barra di ricerca per nome giocatore e squadra con icona di ricerca."
},
{
"path": "src/components/players/PlayerAdvancedFilters.tsx",
"description": "Sistema di filtri avanzati per ruolo, stato asta, tempo rimanente, squadra con contatori filtri attivi."
},
{
"path": "src/components/players/PlayerSearchResults.tsx",
"description": "Griglia responsive di risultati ricerca con gestione stati vuoti e conteggio giocatori."
},
{
"path": "src/components/players/PlayerSearchCard.tsx",
"description": "Card giocatore con stats complete, stato asta, timer countdown e azioni disponibili (bid/start auction)."
},
{
"path": "src/components/players/QuickBidModal.tsx",
"description": "Modal per offerte rapide con validazione budget, offerte quick (+1,+5,+10) e informazioni asta."
},
{
"path": "src/app/api/user/leagues/route.ts",
"description": "API endpoint per recuperare leghe dell'utente corrente con informazioni budget e team."
},
{
"path": "src/app/api/leagues/[league-id]/players-with-status/route.ts",
"description": "API endpoint per giocatori con stato asta, assignment info e calcolo tempo rimanente real-time."
},
{
"path": "src/app/api/leagues/[league-id]/budget/route.ts",
"description": "API endpoint per informazioni budget utente in una lega specifica."
},
{
"path": "src/app/api/leagues/[league-id]/current-auction/route.ts",
"description": "API endpoint per recuperare asta attiva corrente di una lega."
},
{
"path": "src/app/api/leagues/[league-id]/start-auction/route.ts",
"description": "API endpoint per admin per avviare nuove aste per giocatori disponibili."
},
{
"path": "src/components/navbar.tsx",
"description": "Navbar aggiornata con link 'Cerca Giocatori' per accesso rapido all'interfaccia player management."
}
]
}
