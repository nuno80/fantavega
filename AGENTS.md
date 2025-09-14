Fase 0 — Preparazione │
│ │
│ • Goal: lavorare in sicurezza ed essere pronti al rollback │
│ rapido. │
│ • Azioni: │
│ • Crea branch: feature/auto-bid-stability-and-refresh. │
│ • Abilita logging sintetico (console con prefissi) solo │
│ per i punti toccati. │
│ • Definisci metriche manuali: tempo medio render │
│ ManagerColumn, latenza sockets->UI. │
│ │
│ Step 1 — Backend: arricchire il roster con l’auto-bid │
│ dell’utente │
│ │
│ • Goal: ripristinare visibilità dello stato auto-bid │
│ dell’utente all’interno degli slot “in*auction”. │
│ • Cambiamenti: │
│ • src/lib/db/services/auction-league.service.ts │
│ (getManagerRoster): │
│ • Join/lookup su auto_bids per (auction_id │
│ dell’attuale player, user_id = managerUserId, │
│ is_active=1). │
│ • Popola su ciascun player (solo se c’è asta attiva │
│ su quel player): user_auto_bid_max_amount e │
│ user_auto_bid_is_active. │
│ • src/app/api/leagues/[league-id]/managers/route.ts: │
│ • Mappa i nuovi campi user_auto_bid_max_amount e │
│ user_auto_bid_is_active verso il FE (sono già nel │
│ tipo PlayerInRoster). │
│ • Refresh mirato: │
│ • Nessun refresh aggressivo. Le viste verranno │
│ aggiornate con la prima fetch managers successiva (es. │
│ all’ingresso pagina o ad “auction-created/closed”). │
│ • Rischi: │
│ • Query in più. Mitigare con join limitate ai soli │
│ player in aste attive. │
│ • Accettazione: │
│ • Chiamando GET /api/leagues/:id/managers, i player │
│ nello stato “winning” per l’utente corrente espongono │
│ user_auto_bid*_correttamente. │
│ │
│ Step 2 — Frontend: sincronizzare slot con il dato “vivo” │
│ d’asta │
│ │
│ • Goal: evitare refetch completo su “auction-update”; usare │
│ i dati socket per tenere il prezzo e timer aggiornati. │
│ • Cambiamenti: │
│ • src/components/auction/ManagerColumn.tsx: │
│ • InAuctionSlot: mostra current bid e │
│ scheduled*end_time derivandoli da │
│ activeAuctions.find(a.player_id === player.id), con │
│ fallback a │
│ player.assignment_price/scheduled_end_time. │
│ • ResponseNeededSlot: mostra current bid derivandolo │
│ come sopra; response_deadline resta dal roster (è │
│ user-specific). │
│ • Refresh mirato: │
│ • Nessun fetch aggiuntivo: i socket “auction-update” già │
│ aggiornano activeAuctions in AuctionPageContent; gli │
│ slot si aggiornano di conseguenza senza rifare │
│ fetchManagersData. │
│ • Accettazione: │
│ • All’offerta ricevuta via socket, gli slot cambiano │
│ prezzo/timer immediatamente senza ricaricare i roster. │
│ │
│ Step 3 — Ridurre refetch su “auction-update” │
│ │
│ • Goal: rimuovere il refetch completo dei manager ad ogni │
│ “auction-update”. │
│ • Cambiamenti: │
│ • src/app/auctions/AuctionPageContent.tsx: │
│ • In handleAuctionUpdate: elimina/refattorizza la │
│ chiamata fetchManagersData(selectedLeagueId). │
│ • Mantieni fetchManagersData solo su eventi che │
│ cambiano strutturalmente i roster: │
│ • “auction-created”, │
│ “auction-closed-notification”, │
│ “user-abandoned-auction”. │
│ • Refresh mirato: │
│ • Solo i componenti impattati dall’evento si aggiornano │
│ (activeAuctions e budget via payload). │
│ • Accettazione: │
│ • Nessun refetch manager su “auction-update” standard; │
│ UI reattiva e senza rimbalzi. │
│ │
│ Step 4 — UX: aggiornare immediatamente l’indicatore auto-bid │
│ dopo azione utente │
│ │
│ │
│ • Goal: evitare che l’utente debba attendere un refetch per │
│ vedere lo stato dell’auto-bid. │
│ • Cambiamenti: │
│ • src/components/auction/StandardBidModal.tsx: │
│ • Dopo POST /bids con max_amount, dispatch locale a │
│ AuctionPageContent per aggiornare uno stato │
│ “userAutoBidsByPlayer” (Map<playerId, │
│ {max_amount,is_active}>) e passarlo giù a │
│ ManagerColumn, che per il current user può fare │
│ override del display (solo grafico) dei campi │
│ user_auto_bid*_ nello slot. │
│ • Alternativa: emettere socket “auto-bid-changed” (room │
│ user-) dalla route /bids, e aggiornare la mappa │
│ client-side al payload. Entrambe valide; suggerisco │
│ prima soluzione locale per semplicità. │
│ • Refresh mirato: │
│ • Solo lo slot (e il manager corrente) viene aggiornato │
│ lato client. │
│ • Accettazione: │
│ • Dopo aver abilitato/modificato l’auto-bid nel modale, │
│ lo slot “in*auction” mostra subito il “Max N” senza │
│ necessità di ricaricare manager. │
│ │
│ Step 5 — Test mirati │
│ │
│ • Goal: copertura ragionata senza over-testing. │
│ • Cambiamenti: │
│ • Unit (src/lib/db/services/bid.service.ts): │
│ • simulateAutoBidBattle: casi singolo auto-bid, due │
│ auto-bid con parità, max=offerta corrente, ecc. │
│ • Integrazione: │
│ • GET managers: i player “winning” restituiscono │
│ user_auto_bid*\* popolati. │
│ • POST /bids con max_amount: auto-bid upserted; GET │
│ /players/:playerId/auto-bid torna il valore │
│ aggiornato. │
│ • Frontend unit: │
│ • ManagerColumn InAuctionSlot aggiorna prezzo al │
│ cambio di activeAuctions. │
│ • ResponseNeededSlot usa response_deadline come timer │
│ e current bid da activeAuctions. │
│ • Refresh mirato: │
│ • Nessun cambiamento runtime; solo test. │
│ • Accettazione: │
│ • Tutti i test verdi. │
│ │
│ Step 6 — Telemetria leggera e cleanup │
│ │
│ • Goal: monitorare performance e stabilità. │
│ • Cambiamenti: │
│ • Log sintetici con prefisso [AUTO_BID_UI] per tempi di │
│ render slot quando cambia activeAuctions. │
│ • Rimuovere log rumorosi una volta validata la │
│ soluzione. │
│ • Refresh mirato: nessuno. │
│ • Accettazione: metriche manuali stabili, nessun jank │
│ visibile. │
│ │
│ Step 7 — Rollout │
│ │
│ • Goal: consegna sicura e tracciabile. │
│ • Azioni: │
│ • Verifica manuale scenari: attiva auto-bid, rilancio, │
│ parità tra auto-bid, abbandono, chiusura. │
│ • Apri PR con changelog dettagliato e piano di rollback │
│ (ripristino fetchManagersData su “auction-update” come │
│ emergenza). │
│ • Merge dopo approvazione. │
│ │
│ Note sul refresh “solo componenti interessati” │
│ │
│ • Gli aggiornamenti socket aggiornano già │
│ currentAuction/activeAuctions e budget per gli utenti │
│ interessati. │
│ • Con Step 2, gli slot dipenderanno da activeAuctions per │
│ prezzo/timer, allineando il rendering senza rifetch. │
│ • Con Step 4, l’indicatore auto-bid si aggiorna localmente │
│ dopo l’azione. │
│ • Refetch dei roster solo su eventi strutturali: │
│ creazione/chiusura asta, abbandono utente, non sul │
│ normale “auction-update”.
