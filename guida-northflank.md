# Guida Northflank — Socket.IO e scheduler

Questa guida descrive il deploy del solo server Socket.IO di Fantavega su
Northflank. Il frontend e le API Next.js restano su Vercel, mentre il database
condiviso resta su Turso.

## Architettura di produzione

- **Vercel**: frontend Next.js e route API.
- **Northflank**: `socket-server.ts`, Socket.IO, outbox e scheduler.
- **Turso**: database condiviso.
- **Clerk**: autenticazione.

## Configurazione del servizio

1. Collega il repository GitHub `nuno80/fantavega` a Northflank.
2. Crea un servizio combinato basato sul repository.
3. Seleziona il branch `main` e abilita il deploy automatico.
4. Usa il `Dockerfile` nella radice del repository.
5. Pubblica la porta HTTP/WebSocket indicata da `PORT`; il valore configurato
   per Fantavega è `3001`.
6. Genera il dominio pubblico del servizio.

Il container avvia il processo con:

```bash
node --import tsx socket-server.ts
```

## Variabili d'ambiente Northflank

```env
PORT=3001
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
ALLOWED_ORIGINS=https://your-app.vercel.app
SOCKET_EMIT_SECRET=use-a-long-random-shared-secret
```

Per più origini Vercel, usa una lista separata da virgole senza spazi:

```env
ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-preview.vercel.app
```

`SOCKET_EMIT_SECRET` deve avere esattamente lo stesso valore su Northflank e
Vercel. Le chiavi Clerk del frontend non sono necessarie nel servizio Socket.IO.

## Configurazione Vercel

Imposta il dominio pubblico Northflank come URL del socket:

```env
NEXT_PUBLIC_SOCKET_URL=https://your-northflank-public-domain
SOCKET_EMIT_SECRET=the-same-secret-used-on-northflank
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
```

Dopo aver cambiato `NEXT_PUBLIC_SOCKET_URL`, esegui un nuovo deploy Vercel.

## Verifica del deploy

1. Nei log Northflank cerca `socket server listening on 3001`.
2. Apri l'app Vercel e verifica nella console del browser la connessione
   Socket.IO.
3. Avvia un'asta di prova e controlla che gli eventi live aggiornino la UI.
4. Controlla che nei log Northflank non compaiano errori Turso o outbox.

## Risoluzione rapida dei problemi

- **Errore CORS**: verifica che `ALLOWED_ORIGINS` contenga il dominio Vercel.
- **Socket non connesso**: verifica `NEXT_PUBLIC_SOCKET_URL` e lo stato del
  servizio Northflank.
- **Eventi non ricevuti**: verifica che `SOCKET_EMIT_SECRET` coincida nei due
  servizi.
- **Scheduler inattivo**: controlla che il container stia eseguendo
  `socket-server.ts` e che le credenziali Turso siano valide.
