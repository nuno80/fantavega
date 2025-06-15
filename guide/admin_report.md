# Report della cartella `src/app/admin`

Questa cartella contiene i componenti e le API routes relative alla sezione di amministrazione dell'applicazione.

## Struttura della cartella

```
src/app/admin/
├── users/
│   └── page.tsx
└── api/
    └── admin/
        ├── get-users/
        │   └── route.ts
        ├── leagues/
        │   └── route.ts
        ├── leagues/[league-id]/
        └── set-user-role/
            └── route.ts
```

## Sintesi delle funzioni principali dei file

### `src/app/admin/users/page.tsx`

Questo file contiene il componente React per la gestione degli utenti nell'interfaccia di amministrazione. Le sue funzioni principali sono:

- Visualizzare una lista di utenti.
- Caricare la lista degli utenti tramite una chiamata API a `/api/admin/get-users`.
- Permettere la modifica del ruolo di un utente tramite una chiamata API a `/api/admin/set-user-role`.
- Gestire lo stato di caricamento e gli errori durante le chiamate API.

### `src/app/api/admin/get-users/route.ts`

Questo file definisce una API route (GET) per recuperare la lista degli utenti. Le sue funzioni principali sono:

- Autenticare l'utente corrente.
- Verificare che l'utente corrente abbia il ruolo di "admin".
- Utilizzare la libreria Clerk per ottenere una lista di utenti.
- Restituire una risposta JSON contenente la lista degli utenti (con campi semplificati) o un messaggio di errore in caso di mancata autenticazione, autorizzazione o errore interno del server.

### `src/app/api/admin/leagues/route.ts`

Questo file definisce due API routes (POST e GET) per la gestione delle leghe d'asta. Le sue funzioni principali sono:

- **POST:**
  - Autenticare l'utente corrente e verificare che sia un "admin".
  - Validare i dati ricevuti nel corpo della richiesta per la creazione di una nuova lega.
  - Creare una nuova lega d'asta utilizzando il servizio `createAuctionLeague`.
  - Restituire la nuova lega creata o un messaggio di errore in caso di dati mancanti/invalidi, mancata autenticazione/autorizzazione o errore interno.
- **GET:**
  - Autenticare l'utente corrente e verificare che sia un "admin".
  - Recuperare le leghe d'asta associate all'admin corrente utilizzando il servizio `getAuctionLeaguesByAdmin`.
  - Restituire la lista delle leghe o un messaggio di errore.

### `src/app/api/admin/set-user-role/route.ts`

Questo file definisce una API route (POST) per impostare il ruolo di un utente. Le sue funzioni principali sono:

- Autenticare l'utente corrente e verificare che abbia il ruolo di "admin".
- Estrarre l'ID dell'utente da modificare (`userId`) e il nuovo ruolo (`role`) dal corpo della richiesta.
- Impedire a un admin di modificare il proprio ruolo tramite questa API.
- Utilizzare la libreria Clerk per aggiornare il `publicMetadata` dell'utente specificato con il nuovo ruolo.
- Restituire un messaggio di successo con l'ID e il nuovo ruolo dell'utente aggiornato, o un messaggio di errore in caso di mancata autenticazione/autorizzazione, dati mancanti/invalidi o errore interno.

### `src/app/api/admin/leagues/[league-id]/`

Questa è una cartella che probabilmente conterrà API routes dinamiche per gestire specifiche leghe d'asta in base al loro ID (indicato da `[league-id]`). Al momento, non contiene file `route.ts`, suggerendo che le operazioni specifiche su una singola lega (come visualizzazione dettagli, modifica, eliminazione, ecc.) non sono ancora implementate in questa specifica sottocartella API.
