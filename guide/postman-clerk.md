# Guida: Testare API Next.js Protette da Clerk con Postman

Questa guida descrive come configurare Postman per testare gli endpoint API di un'applicazione Next.js (App Router) protetta da `@clerk/nextjs`. Il focus è sull'autenticazione delle richieste API inviate da Postman al tuo backend.

## Prerequisiti

1. **Istanza Clerk ConfigURATA:** La tua applicazione Next.js deve essere integrata con Clerk.
2. **Utenti di Test in Clerk:** Avere almeno un utente di test nel tuo Clerk Dashboard, preferibilmente con ruoli specifici (es. "admin") se la tua applicazione usa RBAC (Role-Based Access Control).
3. **Metadati Utente (per Ruoli):** Se usi i ruoli, assicurati che gli utenti di test abbiano i metadati pubblici configurati correttamente. Ad esempio, per un utente admin:

   - Nel Clerk Dashboard -> Users -> Seleziona l'utente -> Metadata.
   - In **Public Metadata**, aggiungi:

     ```json
     {
       "role": "admin"
     }
     ```

4. **Postman Installato.**

## Metodo di Autenticazione Raccomandato: Token JWT di Lunga Durata da Template

Per testare le API in modo affidabile e per periodi prolungati, l'uso di un token JWT di lunga durata generato da un template Clerk è il metodo raccomandato. I token di sessione Clerk standard del browser scadono rapidamente (60 secondi).

### 1. Creazione del Template JWT nel Dashboard Clerk

Clerk permette di creare template per generare token JWT personalizzati. Questo è essenziale per ottenere un token che:
a. Abbia una durata maggiore.
b. Includa le claims necessarie (come i metadati pubblici per i ruoli).

- **Segui la Guida Ufficiale di Clerk:** La documentazione di Clerk per la creazione di JWT Templates è molto chiara e dettagliata. Fai riferimento a:
  [**Clerk Docs: Manual JWT Verification (Testing with Postman or Insomnia)**](https://clerk.com/docs/testing/postman-or-insomnia)
  (La sezione rilevante è "Generate long-lived JWT template").

- **Punti Chiave Durante la Creazione del Template:**

  - **Nome del Template:** Scegli un nome descrittivo (es. `PostmanTestToken` o `api_dev_token`). Lo userai per generare il token.
  - **Token Lifetime (Durata):** Imposta una durata adeguata per i tuoi test (es. `3600` per 1 ora, `86400` per 24 ore).
  - **Claims (Fondamentale per i Ruoli):** Nella sezione "Claims" del template, devi assicurarti di includere i metadati pubblici dell'utente. Questo è cruciale se il tuo middleware controlla i ruoli basati su `publicMetadata`. Incolla il seguente JSON nella configurazione delle Claims:

        ```json
        {
          "public_metadata": "{{user.public_metadata}}"
        }
        ```

        Questo shortcode `{{user.public_metadata}}` istruirà Clerk a inserire l'intero oggetto `publicMetadata` dell'utente nel token JWT generato.

### 2. Generazione del Token JWT di Lunga Durata

Una volta creato e salvato il template JWT nel Dashboard Clerk:

1. **Apri la tua Applicazione Next.js nel Browser.**
2. **Effettua il Login** come l'utente per cui vuoi generare il token (es. l'utente admin).
3. **Apri la Console degli Sviluppatori** del browser (tasto F12).
4. **Esegui il Seguente Comando JavaScript nella Console:**
   Sostituisci `'NOME_DEL_TUO_TEMPLATE'` con il nome esatto che hai dato al tuo template JWT in Clerk.

   ```javascript
   await window.Clerk.session.getToken({ template: "NOME_DEL_TUO_TEMPLATE" });
   ```

   Ad esempio, se il template si chiama `PostmanTestToken`:

   ```javascript
   await window.Clerk.session.getToken({ template: "PostmanTestToken" });
   ```

5. **Copia il Token:** La console stamperà una lunga stringa racchiusa tra virgolette singole (es. `'eyJ...'`). Questo è il tuo token JWT di lunga durata. Copia la stringa **senza le virgolette singole esterne**.

### 3. Configurazione della Richiesta in Postman

1. **Crea una Nuova Richiesta** o aprine una esistente.
2. **Metodo HTTP e URL:** Imposta il metodo (es. `POST`, `GET`) e l'URL del tuo endpoint API (es. `http://localhost:3000/api/admin/leagues`).
3. **Scheda "Authorization":**
   - Seleziona "Type": **Bearer Token**.
   - Nel campo "Token", incolla il token JWT di lunga durata che hai copiato dal browser.
4. **Scheda "Headers":**
   - Assicurati che sia presente l'header `Content-Type` se stai inviando un corpo JSON (per richieste `POST`, `PUT`, `PATCH`):
     - KEY: `Content-Type`
     - VALUE: `application/json`
   - _Non è necessario aggiungere manualmente un header `Cookie` se usi il Bearer Token._
5. **Scheda "Body" (per richieste `POST`, `PUT`, `PATCH`):**
   - Seleziona "raw".
   - Scegli "JSON" dal menu a tendina del formato.
   - Incolla il tuo corpo JSON.

### 4. Inviare la Richiesta e Verificare

- Clicca "Send".
- Controlla lo **Status Code** e il **Corpo della Risposta** in Postman.
- Controlla i **log del server Next.js** per vedere come il middleware e l'handler API hanno processato la richiesta. I `console.log` nel middleware sono particolarmente utili per verificare che `userId` e `sessionClaims` (inclusi i metadati con il ruolo) siano stati estratti correttamente dal token.

## Troubleshooting Comune

- **401 Unauthorized:**
  - Il token è mancante, malformato o scaduto.
  - La `CLERK_SECRET_KEY` potrebbe non essere configurata correttamente nel backend.
- **403 Forbidden:**
  - L'utente è autenticato ma non ha i permessi/ruoli necessari per accedere alla risorsa (es. un utente manager che tenta di accedere a una rotta admin).
  - Verifica che il token JWT contenga le claims del ruolo corrette (decodificandolo su [jwt.io](https://jwt.io/)) e che il middleware stia controllando il ruolo nel modo giusto (es. `sessionClaims.publicMetadata.role` vs `sessionClaims.metadata.role`).
- **Risposta HTML invece di JSON (spesso con Status 200 OK):**
  - Indica solitamente che il middleware sta eseguendo un redirect a una pagina HTML (es. `/sign-in` o `/no-access`) perché l'autenticazione/autorizzazione è fallita per la richiesta API. Controlla i log del middleware.
- **Errori 500 Internal Server Error:**
  - Controlla i log del server Next.js per errori nel middleware o nell'handler API. Un errore comune è tentare di accedere a una proprietà su un oggetto `sessionClaims` (o sue sotto-proprietà) che è `undefined`.

Seguendo questi passaggi, dovresti essere in grado di testare efficacemente le tue API Next.js protette da Clerk usando Postman.

## Appendice A: File di Definizione dei Tipi Globali (`types/globals.d.ts`)

Per una migliore integrazione con TypeScript e per fornire tipi corretti all'oggetto `sessionClaims` restituito da `auth()` di Clerk, specialmente quando si usano metadati personalizzati, è consigliabile estendere le definizioni di tipo globali di Clerk.

Crea o aggiorna il file `src/types/globals.d.ts` (o un nome simile nel tuo progetto):

```typescript
// src/types/globals.d.ts

// Esporta un tipo per i tuoi ruoli specifici.
// Adatta questa lista ai ruoli effettivamente usati nella tua applicazione.
export type AppRole = "admin" | "manager";

// La riga `export {};` in cima al file è necessaria se il file non contiene altri
// export/import di primo livello, per assicurare che TypeScript lo tratti come un modulo
// e che `declare global` funzioni correttamente. Se hai già `export type AppRole`,
// questa riga `export {};` potrebbe non essere strettamente necessaria, ma è una pratica sicura.
export {};

declare global {
  interface CustomJwtSessionClaims {
    // Per le sessioni browser standard, Clerk spesso mappa publicMetadata a sessionClaims.metadata
    metadata?: {
      role?: AppRole; // Il ruolo è opzionale e del tipo AppRole
      // Aggiungi qui altre proprietà che ti aspetti in metadata
    };

    // Per i token JWT generati da template che includono l'oggetto {{user.public_metadata}},
    // la claim sarà probabilmente accessibile come sessionClaims.publicMetadata (camelCase).
    publicMetadata?: {
      role?: AppRole;
      // Aggiungi qui altre proprietà che hai in publicMetadata dell'utente
    };

    // Potresti anche considerare di aggiungere una firma di indice se hai bisogno di accedere a
    // chiavi con snake_case (es. sessionClaims['public_metadata']) in modo type-safe,
    // anche se i cast nel middleware possono gestire casi specifici.
    // Esempio (usare con cautela, rende il tipo più permissivo):
    // [key: string]: any;
  }
}
```

Nota: Dopo aver creato o modificato questo file .d.ts, potrebbe essere necessario riavviare il server di sviluppo Next.js e anche il server TypeScript del tuo editor (spesso riavviando l'editor stesso) affinché le nuove definizioni di tipo globali vengano riconosciute.

## Appendice B: Implementare un Middleware Next.js Robusto per Clerk (Gestione Ruoli da Sessioni Browser e Token JWT da Template)

Durante lo sviluppo e il testing, è emerso che l'oggetto `sessionClaims` restituito da `await auth()` (proveniente da `@clerk/nextjs/server`) può avere una struttura leggermente diversa per i metadati a seconda che l'autenticazione provenga da una sessione browser standard (basata su cookie) o da un Bearer Token JWT generato da un template Clerk (usato per test API come con Postman).

- **Sessione Browser Standard:** Il ruolo (se presente in `publicMetadata` dell'utente) tende ad essere accessibile tramite `sessionClaims.metadata.role`.
- **Token JWT da Template (con `public_metadata` inclusa):** Il ruolo è presente nel token come parte dell'oggetto `public_metadata`. L'oggetto `sessionClaims` risultante conterrà quindi `sessionClaims.public_metadata.role` (o, come abbiamo visto, potrebbe essere necessario accedere a `sessionClaims['public_metadata'].role` se l'SDK non converte la chiave snake_case in camelCase nell'oggetto JavaScript restituito).

Per gestire entrambi gli scenari in modo affidabile ed evitare errori `TypeError` (come "Cannot read properties of undefined (reading 'role')") o fallimenti di autorizzazione, ecco un esempio di middleware robusto e commentato:

### Middleware Consigliato (`src/middleware.ts`)

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Definisci i tuoi ruoli applicativi. È buona norma averli in un file centralizzato
// o importati da types/globals.d.ts se hai esteso CustomJwtSessionClaims.
type AppRole = "admin" | "manager"; // Adatta ai tuoi ruoli

// Definisci le rotte che devono essere sempre accessibili
const isPublicRoute = createRouteMatcher([
  "/", // Pagina principale
  // Aggiungi qui le tue pagine pubbliche effettive
  "/about",
  "/pricing",
  // Pagine di UI Clerk e di fallback per l'autenticazione
  "/devi-autenticarti",
  "/no-access",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Esempi di API pubbliche
  "/api/webhooks(.*)",
]);

// Definisci le rotte admin (sia pagine che API)
const isAdminRoute = createRouteMatcher([
  "/admin(.*)", // Tutte le pagine sotto /admin
  "/dashboard(.*)", // La pagina /dashboard
  "/api/admin/(.*)", // Tutte le API sotto /api/admin/
]);

// Definisci le rotte che richiedono solo autenticazione (non necessariamente admin)
const isAuthenticatedRoute = createRouteMatcher([
  "/features(.*)", // Esempio
  "/user-profile(.*)", // Esempio
  // Aggiungi qui altre rotte per utenti loggati
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // Log di base per ogni richiesta intercettata dal middleware
  console.log(`\n--- CLERK MIDDLEWARE ---`);
  console.log(`[REQ] ${req.method} ${req.url}`);
  console.log(`[AUTH] User ID: ${userId || "Not Authenticated"}`);

  // Log dettagliato di sessionClaims solo in sviluppo per non appesantire i log di produzione
  if (process.env.NODE_ENV === "development" && sessionClaims) {
    console.log(
      `[AUTH] Raw SessionClaims: ${JSON.stringify(sessionClaims, null, 2)}`
    );
  }

  // 1. Gestione Rotte Pubbliche
  if (isPublicRoute(req)) {
    console.log(`[DECISION] Public route. Allowing.`);
    return NextResponse.next();
  }

  // 2. Gestione Utenti Non Autenticati per Rotte Protette
  // Se arriviamo qui, la rotta non è pubblica, quindi l'autenticazione è richiesta.
  if (!userId) {
    console.log(`[DECISION] User not authenticated for protected route.`);
    if (req.url.startsWith("/api")) {
      console.log("[ACTION] Returning 401 Unauthorized for API request.");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Per le pagine HTML, reindirizza a sign-in, preservando l'URL originale
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search
    );
    console.log(`[ACTION] Redirecting to sign-in: ${signInUrl.toString()}`);
    return NextResponse.redirect(signInUrl);
  }

  // L'utente è autenticato (userId esiste)
  console.log(`[AUTH] User ${userId} is authenticated.`);

  // 3. Gestione Rotte Admin per Utenti Autenticati
  if (isAdminRoute(req)) {
    console.log(
      `[ROUTE] Admin route matched. Checking admin role for user ${userId}.`
    );

    let userIsAdmin = false;
    let roleSourceDetails = "Role not found or sessionClaims missing.";

    if (sessionClaims) {
      // Tentativo 1: sessionClaims.metadata.role (tipico per sessioni browser standard)
      // Questo si basa sull'estensione di CustomJwtSessionClaims in un file .d.ts
      if (sessionClaims.metadata?.role === "admin") {
        userIsAdmin = true;
        roleSourceDetails = "Role 'admin' found in sessionClaims.metadata.role";
      }
      // Tentativo 2: sessionClaims.publicMetadata.role (camelCase, per token JWT che includono l'oggetto publicMetadata)
      else if (sessionClaims.publicMetadata?.role === "admin") {
        userIsAdmin = true;
        roleSourceDetails =
          "Role 'admin' found in sessionClaims.publicMetadata.role (camelCase)";
      }
      // Tentativo 3: sessionClaims['public_metadata']?.role (snake_case, se l'SDK non fa camelCasing della chiave dal token)
      // Questo è stato il caso vincente nel nostro debug per i token JWT da template.
      else {
        // Facciamo un cast per aiutare TypeScript, ma il controllo 'in' è più sicuro a runtime
        const snakeCasePublicMeta = sessionClaims["public_metadata"] as
          | { role?: AppRole }
          | undefined;
        if (snakeCasePublicMeta?.role === "admin") {
          userIsAdmin = true;
          roleSourceDetails =
            "Role 'admin' found in sessionClaims['public_metadata'].role (snake_case)";
        }
      }
    }

    console.log(`[AUTH] Admin check details: ${roleSourceDetails}`);
    console.log(`[AUTH] Result of userIsAdmin check: ${userIsAdmin}`);

    if (userIsAdmin) {
      console.log(`[DECISION] Admin access GRANTED.`);
      return NextResponse.next();
    } else {
      console.log(
        `[DECISION] Admin access DENIED. User ${userId} is not admin.`
      );
      if (req.url.startsWith("/api")) {
        console.log("[ACTION] Returning 403 Forbidden for API admin request.");
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Admin role required" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      // Per le pagine admin HTML, reindirizza a /no-access
      const noAccessUrl = new URL("/no-access", req.url);
      console.log("[ACTION] Redirecting to /no-access page.");
      return NextResponse.redirect(noAccessUrl);
    }
  }

  // 4. Gestione Rotte Autenticate Generiche (non admin, definite in isAuthenticatedRoute)
  if (isAuthenticatedRoute(req)) {
    console.log(
      `[ROUTE] Authenticated (non-admin) route matched. Access GRANTED for user ${userId}.`
    );
    return NextResponse.next();
  }

  // 5. Comportamento di Default per Altre Rotte Protette (utente è loggato ma la rotta non ha regole specifiche)
  // Per default, se l'utente è autenticato e la rotta non è pubblica o admin, permettiamo l'accesso.
  // Modifica questo comportamento se vuoi che tutte le rotte non specificate siano bloccate.
  console.log(
    `[ROUTE] Unspecified protected route. Allowing access for authenticated user ${userId} to ${req.url}.`
  );
  return NextResponse.next();
});

// Configurazione del Matcher per il Middleware
export const config = {
  matcher: [
    // Esegui il middleware su tutte le rotte eccetto quelle interne di Next.js e i file statici.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Esegui sempre il middleware per le rotte API e TRPC.
    "/(api|trpc)(.*)",
  ],
};
```
