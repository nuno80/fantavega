# Guida: Collegare l'App a un Nuovo Account Clerk

Questa guida descrive i passi necessari per collegare l'applicazione Fantavega a un nuovo account Clerk e configurare correttamente il ruolo admin.

## Problema Comune

Quando crei una nuova applicazione Clerk, i **sessionClaims** restituiti da `useAuth()` o `auth()` **non contengono automaticamente i `publicMetadata`** dell'utente (incluso il ruolo). Questo causa il mancato riconoscimento degli admin.

### Sintomi del problema:
- L'utente ha `role: "admin"` nei Public Metadata in Clerk Dashboard
- L'accesso a `/dashboard` o `/admin` viene negato
- I log mostrano: `Role source for admin check: none`

---

## Passi per Collegare un Nuovo Account Clerk

### 1. Crea l'Applicazione in Clerk Dashboard

1. Vai su [clerk.com](https://clerk.com) e accedi
2. Clicca su **"Create application"**
3. Scegli il nome dell'app e i metodi di autenticazione
4. Copia le chiavi API:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

### 2. Configura le Environment Variables

Aggiorna il file `.env.local` (locale) e le Environment Variables su Vercel:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 3. Imposta il Ruolo Admin in Clerk

1. Vai su **Clerk Dashboard** → **Users**
2. Seleziona l'utente che sarà admin
3. Nella sezione **Metadata** → **Public**, clicca **Edit**
4. Aggiungi:
```json
{
  "role": "admin"
}
```
5. **Salva**

### 4. Sincronizza l'Utente con il Database

Il nuovo utente Clerk ha un **userId diverso** dal precedente. Devi inserirlo nel database:

```sql
INSERT INTO users (id, email, role, status)
VALUES (
  'user_NUOVO_ID_DA_CLERK',
  'tua@email.com',
  'admin',
  'active'
);
```

Puoi eseguire questa query:
- Via **Turso CLI**: `turso db shell <nome-db>`
- Via script Node.js con `@libsql/client`
- Via la console web di Turso Dashboard

### 5. (Opzionale) Configura il Session Token

Se vuoi che i `publicMetadata` siano inclusi nei `sessionClaims`:

1. Vai su **Clerk Dashboard** → **Configure** → **Sessions**
2. Trova **"Customize session token"**
3. Aggiungi nelle Claims:
```json
{
  "metadata": "{{user.public_metadata}}"
}
```
4. **Salva**

> **Nota**: Anche senza questa configurazione, usando `clerkClient()` nel middleware come fallback, l'app funzionerà correttamente.

### 6. Fai Logout e Ri-Login

Dopo tutte le modifiche, fai sempre:
1. **Logout** dall'applicazione
2. **Chiudi tutte le tab** del browser
3. **Ri-login**

---

## Soluzioni nel Codice

### Problema: i sessionClaims non contengono il ruolo

Ci sono due soluzioni:

#### Soluzione A: Usare `clerkClient()` come fallback nel middleware

Nel middleware, dopo aver controllato i sessionClaims, fai una chiamata API a Clerk per ottenere i metadata:

```typescript
import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// ... dopo aver controllato sessionClaims ...

if (!userIsAdmin && userId) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    if (user.publicMetadata?.role === "admin") {
      userIsAdmin = true;
    }
  } catch (error) {
    console.error("Error fetching user from Clerk API:", error);
  }
}
```

#### Soluzione B: Usare `useUser()` invece di `useAuth()` nei componenti client

Nel componente Navbar o altri componenti client:

```typescript
// ❌ NON funziona - sessionClaims non contiene il ruolo
const { sessionClaims } = useAuth();
const isAdmin = sessionClaims?.metadata?.role === "admin";

// ✅ FUNZIONA - useUser() include publicMetadata
const { user } = useUser();
const isAdmin = user?.publicMetadata?.role === "admin";
```

---

## Esempio Completo di Middleware

Ecco un esempio completo di middleware che gestisce sia sessionClaims che fallback a Clerk API:

```typescript
// src/middleware.tsx
import { NextResponse } from "next/server";
import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

type AppRole = "admin" | "manager";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about",
  "/pricing",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  "/api/admin/(.*)",
]);

const isAuthenticatedRoute = createRouteMatcher([
  "/features(.*)",
  "/api/user/(.*)",
  "/api/leagues/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // 1. Route pubbliche - sempre accessibili
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 2. Utente non autenticato
  if (!userId) {
    if (req.url.startsWith("/api")) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Controllo ruolo admin per route admin
  if (isAdminRoute(req)) {
    let userIsAdmin = false;

    // Tentativo 1: Cerca nei sessionClaims
    if (sessionClaims) {
      if (
        sessionClaims.metadata?.role === "admin" ||
        sessionClaims.publicMetadata?.role === "admin" ||
        (sessionClaims["public_metadata"] as { role?: string })?.role === "admin"
      ) {
        userIsAdmin = true;
      }
    }

    // Tentativo 2: Fallback a Clerk API
    if (!userIsAdmin) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        if (user.publicMetadata?.role === "admin") {
          userIsAdmin = true;
        }
      } catch (error) {
        console.error("[AUTH] Error fetching user from Clerk API:", error);
      }
    }

    if (userIsAdmin) {
      return NextResponse.next();
    } else {
      if (req.url.startsWith("/api")) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Admin role required" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return NextResponse.redirect(new URL("/no-access", req.url));
    }
  }

  // 4. Route autenticate generiche
  if (isAuthenticatedRoute(req)) {
    return NextResponse.next();
  }

  // 5. Default: permetti accesso a utenti autenticati
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

---

## Checklist Rapida

- [ ] Aggiornate le chiavi Clerk in `.env.local`
- [ ] Aggiornate le chiavi Clerk su Vercel (Environment Variables)
- [ ] Impostato `role: "admin"` nei Public Metadata dell'utente in Clerk
- [ ] Inserito l'utente nel database con il nuovo userId e `role = 'admin'`
- [ ] (Opzionale) Configurato il Session Token per includere i metadata
- [ ] Fatto logout e ri-login

---

## Troubleshooting

### L'utente non è riconosciuto come admin

1. Verifica che il `userId` nel database corrisponda a quello in Clerk
2. Verifica che i Public Metadata in Clerk contengano `{"role": "admin"}`
3. Controlla i log del server per vedere cosa arriva nei sessionClaims

### Errore FOREIGN KEY nel database

Significa l'utente non esiste nella tabella `users`. Inseriscilo con la query SQL sopra.

### Il link "Admin Panel" non appare nella navbar

Assicurati che la navbar usi `useUser()` invece di `useAuth()`:
```typescript
const { user } = useUser();
const isAdmin = user?.publicMetadata?.role === "admin";
```
