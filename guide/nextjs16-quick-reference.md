# Next.js 16 Quick Reference

> **Documento Principale** - Base di conoscenza essenziale per sviluppo Next.js 16
> Leggi questo documento per il 80% dei task. Approfondisci nei moduli specifici per il restante 20%.

---

## 🧠 Mental Model (LEGGERE SEMPRE)

### Server Components vs Client Components

Next.js 16 usa React Server Components (RSC) come architettura fondamentale:

```
┌─────────────────────────────────────────────────────────┐
│                    App Router                            │
├─────────────────────────────────────────────────────────┤
│  Server Components (DEFAULT)                             │
│  ✅ Eseguiti sul server                                  │
│  ✅ Accesso diretto a DB, filesystem, API keys           │
│  ✅ Zero JavaScript al client                            │
│  ✅ Possono essere async                                 │
│  ❌ NO state (useState, useReducer)                      │
│  ❌ NO effects (useEffect)                               │
│  ❌ NO event handlers (onClick, onChange)                │
│  ❌ NO browser APIs (window, localStorage)               │
├─────────────────────────────────────────────────────────┤
│  Client Components ("use client")                        │
│  ✅ Interattività (state, events, effects)               │
│  ✅ Browser APIs                                         │
│  ✅ Hooks di React                                       │
│  ❌ Aggiungono JavaScript al bundle                      │
│  ❌ Non possono essere async                             │
└─────────────────────────────────────────────────────────┘
```

**Regola d'Oro:** Inizia con Server Components, usa Client Components solo quando necessario.

### Decision Tree: Server vs Client?

```
Hai bisogno di:
├─ Fetch dati dal DB/API? → Server Component
├─ Mantenere dati sensibili (API keys)? → Server Component
├─ Ridurre bundle JavaScript? → Server Component
├─ useState/useEffect? → Client Component ("use client")
├─ onClick/onChange? → Client Component ("use client")
├─ window/localStorage? → Client Component ("use client")
└─ Hooks di librerie (useForm, etc)? → Client Component ("use client")
```

---

## 🎭 Suspense & Streaming Architecture (CRITICO)

### Il Nuovo Modello di Next.js 16

Con Cache Components, Next.js 16 introduce:

```
Static Shell (cached) + Dynamic Streaming (real-time) = Performance Ottimale
```

**Visualizzazione:**

```
┌─────────────────────────────────┐
│  Static Header (pre-rendered)   │ ← Visibile immediatamente
├─────────────────────────────────┤
│  Product Info (cached)          │ ← Visibile immediatamente
├─────────────────────────────────┤
│  [Loading Cart...]              │ ← Fallback UI → poi Streaming
├─────────────────────────────────┤
│  [Loading Recommendations...]   │ ← Fallback UI → poi Streaming
└─────────────────────────────────┘
```

### I 3 Tipi di Dati (Memorizza Questo!)

#### 1. Runtime Data (Dati Specifici della Richiesta)
```tsx
// cookies(), headers(), searchParams
// ⚠️ SEMPRE wrappare in Suspense
```

#### 2. Dynamic Data (Dati che Cambiano)
```tsx
// fetch(), DB queries senza cache
// ✅ Raccomandato Suspense per streaming
```

#### 3. Cached Data (Dati Stabili)
```tsx
// "use cache" + cacheLife()
// ✅ Incluso nello static shell, NO Suspense
```

### Pattern Essenziale: Cached + Dynamic

```tsx
// ✅ PATTERN CORRETTO
export default function ProductPage() {
  return (
    <>
      {/* Static shell - incluso nel pre-render */}
      <CachedProductInfo />
      
      {/* Dynamic - streamed in parallelo */}
      <Suspense fallback={<CartSkeleton />}>
        <UserCart />
      </Suspense>
      
      <Suspense fallback={<RecommendationsSkeleton />}>
        <PersonalizedRecommendations />
      </Suspense>
    </>
  );
}

// Cached - nello static shell
async function CachedProductInfo() {
  "use cache";
  cacheLife('hours');
  const products = await db.products.findMany();
  return <ProductGrid products={products} />;
}

// Dynamic - runtime data
async function UserCart() {
  const userId = (await cookies()).get('userId')?.value;
  const cart = await getCart(userId);
  return <Cart items={cart} />;
}
```

### ❌ Errore Comune: Dynamic senza Suspense

```tsx
// ❌ ERRORE: Uncached data accessed outside of <Suspense>
export default async function Page() {
  const userId = (await cookies()).get('userId'); // ⚠️ CRASH!
  return <div>{userId}</div>;
}

// ✅ CORRETTO: Wrappa in Suspense
export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  );
}

async function UserProfile() {
  const userId = (await cookies()).get('userId'); // ✅ OK
  return <div>{userId}</div>;
}
```

### Decision Tree: Serve Suspense?

```
Il componente accede a:
├─ cookies() o headers()? → SÌ, Suspense OBBLIGATORIO
├─ searchParams (senza generateStaticParams)? → SÌ, Suspense OBBLIGATORIO
├─ params dinamici? → SÌ, Suspense OBBLIGATORIO
├─ fetch() / DB query senza cache? → Raccomandato (per streaming)
├─ "use cache"? → NO, va nello static shell
└─ Solo props statiche? → NO
```

### File Speciali: loading.tsx

```tsx
// app/products/loading.tsx
export default function Loading() {
  return <ProductsSkeleton />;
}

// Next.js wrappa automaticamente:
// <Suspense fallback={<Loading />}>
//   <Page />
// </Suspense>
```

### Regola d'Oro 🎯

```
Runtime APIs (cookies, headers, searchParams) 
= Suspense Boundary Obbligatorio
```

**→ Approfondimenti:** `03-data-fetching-caching.md`

---

## ⚠️ Breaking Changes (ATTENZIONE!)

### 1. Async `params` e `searchParams` (CRITICO)

```tsx
// ❌ Next.js 15 (OBSOLETO)
function Page({ params, searchParams }) {
  const { id } = params; // Sincrono
  const { sort } = searchParams; // Sincrono
}

// ✅ Next.js 16 (OBBLIGATORIO)
async function Page({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ id: string }>; 
  searchParams: Promise<{ sort: string }>;
}) {
  const { id } = await params; // ⚠️ AWAIT obbligatorio
  const { sort } = await searchParams; // ⚠️ AWAIT obbligatorio
  
  return <div>Product {id}</div>;
}
```

**Soluzione Rapida:**
```bash
# Genera type helpers automatici
npx next typegen

# Esegui codemod automatico
npx @next/codemod@latest next-async-request-api .
```

### 2. Caching è OPT-IN (Non più Automatico)

```tsx
// ❌ Next.js 15: fetch() cachava automaticamente
const res = await fetch('https://api.example.com/data'); // Era cached

// ✅ Next.js 16: NIENTE è cached di default
const res1 = await fetch('https://api.example.com/data'); // Dinamico
const res2 = await fetch('https://api.example.com/data', { 
  cache: 'no-store' 
}); // Esplicito

// ✅ Per cachare, usa "use cache"
async function getCachedData() {
  "use cache";
  cacheLife('hours');
  const res = await fetch('https://api.example.com/data');
  return res.json();
}
```

### 3. middleware.ts → proxy.ts (Deprecato)

```ts
// ⚠️ middleware.ts è deprecato (ancora supportato temporaneamente)
// ✅ Rinomina in proxy.ts

// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  console.log('Request URL:', request.url);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### 4. Node.js 18 Non Più Supportato

```bash
# ⚠️ Richiesto: Node.js >= 20.9.0
node --version  # Deve essere >= 20.9.0
```

---

## 🎯 Decision Trees

### Quando Usare Server Components?

```
✅ USA Server Component quando:
├─ Fetch dati da DB/API
├─ Accesso a filesystem o risorse server
├─ Mantenere secrets/API keys
├─ Ridurre JavaScript bundle
├─ SEO importante
└─ Rendering statico

❌ USA Client Component quando:
├─ useState, useReducer
├─ useEffect, useLayoutEffect
├─ Event handlers (onClick, onChange)
├─ Browser APIs (window, localStorage)
├─ Hooks di terze parti (useForm, etc)
└─ Componenti interattivi
```

### Quando Cachare con "use cache"?

```
✅ USA "use cache" per:
├─ Dati che cambiano raramente (hours/days)
├─ Contenuti statici (blog posts, product catalogs)
├─ Risultati di query costose
├─ API calls con rate limiting
└─ Dati condivisi tra utenti

❌ NON cachare:
├─ Dati user-specific (carrello, notifiche)
├─ Real-time data (stock prices, chat)
├─ Dati che cambiano frequentemente (seconds/minutes)
└─ Runtime APIs (cookies, headers)
```

### updateTag() vs revalidateTag()?

```
✅ USA updateTag() quando:
├─ Form submission
├─ User actions che modificano dati
├─ L'utente si aspetta feedback immediato
├─ "Read-your-writes" semantics
└─ Profile updates, settings changes

✅ USA revalidateTag() quando:
├─ Background jobs
├─ Cron/scheduled tasks
├─ Eventual consistency è OK
├─ Content publishing workflows
└─ Bulk updates
```

---

## 📐 Anatomy Patterns (Template Mentali)

### Page con Suspense (Pattern Standard)

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Static shell */}
      <CachedStats />
      
      {/* Dynamic sections - streaming parallelo */}
      <div className="grid">
        <Suspense fallback={<CardSkeleton />}>
          <RevenueCard />
        </Suspense>
        
        <Suspense fallback={<CardSkeleton />}>
          <UsersCard />
        </Suspense>
        
        <Suspense fallback={<CardSkeleton />}>
          <OrdersCard />
        </Suspense>
      </div>
    </div>
  );
}

async function CachedStats() {
  "use cache";
  cacheLife('hours');
  const stats = await db.getStats();
  return <StatsOverview stats={stats} />;
}

async function RevenueCard() {
  const revenue = await db.getRevenueToday();
  return <Card title="Revenue" value={revenue} />;
}
```

### Server Component Template

```tsx
// app/blog/[slug]/page.tsx
import { cacheLife, cacheTag } from 'next/cache';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

export default async function BlogPost({ params, searchParams }: Props) {
  // 1. Await params (Next.js 16)
  const { slug } = await params;
  const query = await searchParams;
  
  // 2. Fetch data
  const post = await getPost(slug);
  
  if (!post) {
    notFound(); // 404 page
  }
  
  // 3. Render
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}

// 4. Optional: Cache function
async function getPost(slug: string) {
  "use cache";
  cacheTag(`post-${slug}`);
  cacheLife('hours');
  
  return await db.post.findUnique({ where: { slug } });
}
```

### Server Action Template

```tsx
// app/actions.ts
"use server";

import { z } from 'zod';
import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';

// 1. Define validation schema
const productSchema = z.object({
  name: z.string().min(3).max(100),
  price: z.coerce.number().positive(),
  published: z.boolean(),
});

// 2. Server Action
export async function createProduct(formData: FormData) {
  // 3. Validate input
  const rawData = {
    name: formData.get('name'),
    price: formData.get('price'),
    published: formData.get('published') === 'true',
  };
  
  try {
    const validatedData = productSchema.parse(rawData);
    
    // 4. Auth check (se necessario)
    const session = await verifySession();
    if (!session) {
      throw new Error('Unauthorized');
    }
    
    // 5. Mutate data
    const product = await db.product.create({
      data: validatedData,
    });
    
    // 6. Invalidate cache
    updateTag('products'); // Read-your-writes
    
    // 7. Optional: redirect
    redirect(`/products/${product.id}`);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        errors: error.errors 
      };
    }
    return { 
      success: false, 
      error: 'Failed to create product' 
    };
  }
}
```

### DAL Function Template (Data Access Layer)

```tsx
// lib/dal/posts.ts
import { cache } from 'react';
import { verifySession } from './auth';

// Cache per evitare fetch multipli nella stessa request
export const getPost = cache(async (postId: string) => {
  // 1. Auth check
  const session = await verifySession();
  
  try {
    // 2. Fetch from DB
    const post = await db.post.findUnique({
      where: { id: postId },
      select: {
        // 3. DTO pattern - solo campi sicuri
        id: true,
        title: true,
        content: true,
        published: true,
        author: {
          select: {
            id: true,
            name: true,
            // ❌ NON includere: email, password
          },
        },
      },
    });
    
    // 4. Authorization check
    if (!post) return null;
    
    if (!post.published && post.authorId !== session?.userId) {
      return null; // Non autorizzato
    }
    
    return post;
    
  } catch (error) {
    console.error('Failed to fetch post:', error);
    throw new Error('Failed to fetch post');
  }
});

// Mutation function
export async function updatePost(
  postId: string, 
  data: { title?: string; content?: string }
) {
  const session = await verifySession();
  
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  // Verifica ownership
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  
  if (!post || post.authorId !== session.userId) {
    throw new Error('Forbidden');
  }
  
  return await db.post.update({
    where: { id: postId },
    data,
  });
}
```

---

## 🔒 Security Checklist (NON NEGOZIABILE)

```
✅ SEMPRE:
├─ Validare TUTTI gli input (usa Zod o simili)
├─ Verificare autenticazione (verifySession in DAL)
├─ Verificare autorizzazione (ownership, permissions)
├─ DTO pattern (mai esporre oggetti DB completi)
├─ MAI esporre password (anche se hashate)
├─ MAI mettere secrets in NEXT_PUBLIC_* variables
├─ Error handling che NON espone stack traces
├─ Try-catch in tutte le Server Actions
├─ Sanitize HTML/SQL (usa ORM come Prisma)
└─ Rate limiting per operazioni sensibili

❌ MAI:
├─ NEXT_PUBLIC_DATABASE_URL
├─ NEXT_PUBLIC_API_SECRET
├─ Restituire { password: user.password } anche se hashed
├─ Esporre dettagli errori al client (solo messages generici)
└─ Accettare input non validati
```

---

## 📁 File System Conventions (Quick Reference)

```
app/
├─ page.tsx              → Route UI (obbligatorio per route)
├─ layout.tsx            → Layout condiviso (wrappa children)
├─ loading.tsx           → Suspense fallback (automatico)
├─ error.tsx             → Error boundary (gestione errori)
├─ not-found.tsx         → 404 page
├─ route.ts              → API endpoint (GET, POST, etc)
│
├─ [id]/                 → Dynamic route (/products/123)
│   └─ page.tsx
│
├─ [...slug]/            → Catch-all route (/blog/a/b/c)
│   └─ page.tsx
│
├─ (group)/              → Route group (NO URL segment)
│   ├─ page1/
│   └─ page2/
│
├─ _private/             → Private folder (ignorato dal router)
│   └─ components/
│
└─ api/                  → API routes
    └─ users/
        └─ route.ts      → /api/users endpoint
```

**Regole:**
- `page.tsx` definisce una route
- `layout.tsx` wrappa tutte le pages figlie
- `loading.tsx` = `<Suspense fallback={<Loading />}>`
- `error.tsx` = Error boundary automatico
- Cartelle con `()` non creano segmenti URL

---

## 📦 Common Imports (Reference Rapido)

```tsx
// ============ NAVIGATION ============
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { notFound } from 'next/navigation';

// ============ CACHING (Next.js 16) ============
import { cacheLife, cacheTag, updateTag, revalidateTag } from 'next/cache';
import { cache } from 'react'; // Per memoization in-request

// ============ REQUEST APIs ============
import { cookies, headers } from 'next/headers';

// ============ IMAGES & FONTS ============
import Image from 'next/image';
import { Inter, Roboto_Mono } from 'next/font/google';
import localFont from 'next/font/local';

// ============ METADATA ============
import type { Metadata, ResolvingMetadata } from 'next';
import { ImageResponse } from 'next/og'; // Per OG images dinamiche

// ============ CLERK AUTH ============
import { auth, currentUser } from '@clerk/nextjs/server'; // Server
import { useUser, useAuth } from '@clerk/nextjs'; // Client
import { ClerkProvider } from '@clerk/nextjs';

// ============ VALIDATION ============
import { z } from 'zod';

// ============ REACT ============
import { Suspense } from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
```

**⚠️ Errori Comuni da Evitare:**
```tsx
// ❌ SBAGLIATO (Next.js 13/14)
import { useRouter } from 'next/router'; // Pages Router!

// ✅ CORRETTO (Next.js 16 App Router)
import { useRouter } from 'next/navigation';
```

---

## 🚀 Performance Defaults (Always-On)

### 1. Turbopack (Predefinito)

```bash
# ✅ Turbopack è già attivo (no config needed)
npm run dev   # Usa Turbopack
npm run build # Build produzione con Turbopack
```

**Vantaggi:**
- 2-5x più veloce in produzione
- 5-10x più veloce Fast Refresh (hot reload)

### 2. React Compiler (Stabile)

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    reactCompiler: true, // Abilita memoization automatica
  }
}

module.exports = nextConfig
```

**Vantaggi:**
- Memoization automatica (no useMemo/useCallback manuale)
- Meno re-render
- Codice più pulito

### 3. Image Optimization (next/image)

```tsx
// ✅ SEMPRE usare next/image
import Image from 'next/image';

<Image
  src="/product.jpg"
  alt="Product"
  width={800}
  height={600}
  priority // Solo per above-the-fold images
  // Next.js ottimizza automaticamente:
  // - Lazy loading (default)
  // - WebP/AVIF conversion
  // - Responsive images
  // - Placeholder blur
/>
```

### 4. Font Optimization (next/font)

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap', // Evita FOIT
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
```

**Vantaggi:**
- Self-hosting automatico (no Google Fonts request)
- Zero layout shift
- Privacy-friendly

### 5. Metadata per SEO

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | My Site',
    default: 'My Site',
  },
  description: 'Site description',
  openGraph: {
    title: 'My Site',
    description: 'Site description',
    images: ['/og-image.jpg'],
  },
};
```

---

## 🔗 Approfondimenti (Moduli Dettagliati)

Quando hai bisogno di maggiori dettagli, consulta questi moduli:

```
📁 01-routing-navigation.md
   → Dynamic routes, route groups, parallel routes, intercepting routes

📁 02-server-client-components.md
   → Composizione, boundary patterns, performance tips

📁 03-data-fetching-caching.md
   → Suspense avanzato, streaming, error handling, cache strategies

📁 04-server-actions.md
   → Form handling, validazione, progressive enhancement, error handling

📁 05-metadata-seo.md
   → generateMetadata, OG images, sitemap, robots.txt

📁 06-authentication-clerk.md
   → Setup completo, protezione routes, user management

📁 07-dal-security.md
   → Data Access Layer pattern, RBAC, DTO, security audit

📁 08-image-font-optimization.md
   → next/image avanzato, next/font, loader custom

📁 09-environment-variables.md
   → Best practices, type safety, Zod validation

📁 10-deployment-production.md
   → Vercel, Docker, self-hosting, performance monitoring
```

---

## 🎯 Quick Checklist per Ogni Task

### Creare una Nuova Page

```
✅ Server Component di default (async function)
✅ Await params e searchParams
✅ Suspense per dati dinamici (cookies, headers, searchParams)
✅ "use cache" per dati statici
✅ Metadata export (titolo, description)
✅ Error handling (try-catch, error.tsx)
✅ Loading state (loading.tsx o Suspense)
```

### Creare una Server Action

```
✅ "use server" directive
✅ Zod validation per input
✅ verifySession() per auth
✅ Try-catch per error handling
✅ updateTag() per cache invalidation
✅ Return { success, error } non throw
```

### Creare una Route API

```
✅ File route.ts (non .tsx)
✅ Export GET, POST, PUT, DELETE, etc
✅ NextResponse.json() per response
✅ Zod validation
✅ Auth check (await auth())
✅ Error handling con status codes
```

### Setup Autenticazione

```
✅ ClerkProvider in root layout
✅ proxy.ts per proteggere routes
✅ auth() in Server Components
✅ useAuth() in Client Components
✅ DAL pattern per data access
```

---

## 📖 Convenzioni di Nomenclatura

```tsx
// ✅ File names
page.tsx         // Lowercase
layout.tsx       // Lowercase
loading.tsx      // Lowercase
error.tsx        // Lowercase
not-found.tsx    // Kebab-case

// ✅ Components
function UserProfile() {}      // PascalCase
function ProductCard() {}      // PascalCase

// ✅ Functions
async function getUser() {}    // camelCase
async function fetchPosts() {} // camelCase

// ✅ Server Actions
export async function createPost() {}  // camelCase
export async function updateUser() {}  // camelCase

// ✅ Constants
const API_URL = '...';         // UPPER_SNAKE_CASE
const MAX_ITEMS = 100;         // UPPER_SNAKE_CASE

// ✅ Types/Interfaces
type UserProps = {};           // PascalCase
interface ProductData {}       // PascalCase
```

---

## ⚡ Performance Tips (Quick Wins)

```tsx
// 1. ✅ Usa cache() per deduplicare fetch nella stessa request
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } });
});

// 2. ✅ Streaming parallelo con Suspense multipli
<Suspense fallback={<A />}><ComponentA /></Suspense>
<Suspense fallback={<B />}><ComponentB /></Suspense>
// ComponentA e ComponentB vengono fetchati in PARALLELO

// 3. ✅ Layout deduplication (automatico)
// Se hai 50 link a prodotti diversi, il layout viene scaricato UNA sola volta

// 4. ✅ Prefetch automatico con <Link>
<Link href="/products" prefetch={true}>Products</Link>
// Next.js precarica la pagina quando il link entra nel viewport

// 5. ✅ React Compiler elimina useMemo/useCallback
// Scrivi codice pulito, il compiler ottimizza automaticamente
```

---

## 🐛 Troubleshooting (Errori Comuni)

### 1. "Uncached data was accessed outside of <Suspense>"

```tsx
// ❌ Problema
async function Page() {
  const userId = (await cookies()).get('userId'); // ⚠️ ERRORE
  return <div>{userId}</div>;
}

// ✅ Soluzione
function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  );
}

async function UserProfile() {
  const userId = (await cookies()).get('userId'); // ✅ OK
  return <div>{userId}</div>;
}
```

### 2. "Cannot read properties of undefined (reading 'id')"

```tsx
// ❌ Problema: params non await
function Page({ params }) {
  const { id } = params; // ⚠️ params è Promise!
}

// ✅ Soluzione
async function Page({ params }) {
  const { id } = await params; // ✅ Await obbligatorio
}
```

### 3. "Module not found: Can't resolve 'next/router'"

```tsx
// ❌ Problema: import sbagliato
import { useRouter } from 'next/router'; // Pages Router!

// ✅ Soluzione: App Router
import { useRouter } from 'next/navigation';
```

### 4. "You're importing a component that needs useState..."

```tsx
// ❌ Problema: Client Component senza "use client"
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0); // ⚠️ ERRORE
  return <button>{count}</button>;
}

// ✅ Soluzione: Aggiungi "use client"
"use client";
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0); // ✅ OK
  return <button>{count}</button>;
}
```

---

## 🎓 Learning Path (Ordine Consigliato)

```
1. Leggi questo Quick Reference (hai appena finito! 🎉)
2. Esplora: 01-routing-navigation.md
3. Esplora: 02-server-client-components.md
4. Esplora: 03-data-fetching-caching.md (critico!)
5. Esplora: 04-server-actions.md
6. Esplora: 07-dal-security.md (prima di andare in produzione)
7. Altri moduli secondo necessità
```

---

## 💡 Pro Tips

### 1. Type Safety con Type Helpers

```bash
# Genera type helpers automatici per params/searchParams
npx next typegen
```

```tsx
// Ora hai autocomplete e type checking
import type { PageProps } from '@/types/page';

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params; // ✅ TypeScript sa che slug esiste
  const { sort } = await props.searchParams; // ✅ Autocomplete
}
```

### 2. Debugging con React DevTools

```tsx
// Server Components appaiono come <Suspense> boundaries
// Client Components sono identificabili dall'icona 🔵
// Usa React DevTools Profiler per identificare re-render
```

### 3. Performance Monitoring

```tsx
// app/layout.tsx
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

### 4. Environment Variables Type Safety

```ts
// env.d.ts
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      NEXT_PUBLIC_API_URL: string;
      // ... altri env vars
    }
  }
}

export {};
```

### 5. VSCode Extensions Consigliate

```json
{
  "recommendations": [
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

---

## 🔄 Migrazione da Next.js 15

Se stai migrando da Next.js 15, segui questi step:

```bash
# 1. Aggiorna dipendenze
npm install next@latest react@latest react-dom@latest

# 2. Verifica Node.js version
node --version  # Deve essere >= 20.9.0

# 3. Esegui codemod per async params
npx @next/codemod@latest next-async-request-api .

# 4. Genera type helpers
npx next typegen

# 5. (Opzionale) Rinomina middleware → proxy
mv src/middleware.ts src/proxy.ts

# 6. Revedi la strategia di caching
# Identifica le pagine che dovrebbero essere cached
# Aggiungi "use cache" dove appropriato

# 7. Test completo dell'app
npm run dev
npm run build
```

**Breaking Changes da Verificare:**
- ✅ Tutti i `params` e `searchParams` sono await?
- ✅ Hai aggiunto `"use cache"` dove necessario?
- ✅ Hai wrappato runtime APIs in Suspense?
- ✅ Hai aggiornato gli import (next/router → next/navigation)?

---

## 📊 Decision Matrix: Caching Strategy

```
Tipo di Contenuto          | Strategia         | TTL      | Pattern
---------------------------|-------------------|----------|------------------
Blog posts                 | "use cache"       | hours    | cacheLife('hours')
Product catalog            | "use cache"       | hours    | cacheLife('hours')
User dashboard             | No cache          | -        | Suspense
Shopping cart              | No cache          | -        | Suspense + cookies()
Real-time data             | No cache          | -        | Dynamic
Static pages               | "use cache"       | days     | cacheLife('days')
API responses (external)   | "use cache"       | minutes  | cacheLife('minutes')
User notifications         | No cache          | -        | Dynamic + fetch
SEO metadata               | "use cache"       | max      | cacheLife('max')
Analytics data             | "use cache"       | hours    | cacheLife('hours')
```

---

## 🎨 Component Composition Patterns

### Pattern 1: Server Component con Client Component Figli

```tsx
// ✅ CORRETTO: Server Component wrappa Client Components
// app/products/page.tsx (Server Component)

import ProductList from './ProductList'; // Client Component
import { getProducts } from '@/lib/dal/products';

export default async function ProductsPage() {
  const products = await getProducts(); // Fetch sul server
  
  return (
    <div>
      <h1>Products</h1>
      {/* Passa dati come props al Client Component */}
      <ProductList products={products} />
    </div>
  );
}
```

```tsx
// components/ProductList.tsx (Client Component)
"use client";

import { useState } from 'react';

export default function ProductList({ products }) {
  const [filter, setFilter] = useState('');
  
  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  return (
    <>
      <input 
        value={filter} 
        onChange={e => setFilter(e.target.value)} 
        placeholder="Filter..."
      />
      <ul>
        {filtered.map(p => <li key={p.id}>{p.name}</li>)}
      </ul>
    </>
  );
}
```

### Pattern 2: Client Component con Server Component Children

```tsx
// ❌ IMPOSSIBILE: Client Component NON può importare Server Components
"use client";

import ServerComponent from './ServerComponent'; // ⚠️ ERRORE!

// ✅ SOLUZIONE: Usa children prop
"use client";

export default function ClientWrapper({ children }) {
  return <div className="wrapper">{children}</div>;
}
```

```tsx
// app/page.tsx (Server Component)
import ClientWrapper from './ClientWrapper';
import ServerComponent from './ServerComponent';

export default function Page() {
  return (
    <ClientWrapper>
      {/* Server Component come children ✅ */}
      <ServerComponent />
    </ClientWrapper>
  );
}
```

### Pattern 3: Shared Components (Server e Client)

```tsx
// components/Button.tsx
// NO "use client" - può essere usato ovunque

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}

export default function Button({ children, onClick, type = 'button' }: ButtonProps) {
  return (
    <button 
      type={type}
      onClick={onClick}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {children}
    </button>
  );
}

// ✅ Usabile in Server Components (senza onClick)
// ✅ Usabile in Client Components (con onClick)
```

---

## 🧪 Testing Patterns

### Unit Testing Server Actions

```tsx
// app/actions.test.ts
import { createProduct } from './actions';
import { db } from '@/lib/db';

// Mock del database
jest.mock('@/lib/db');

describe('createProduct', () => {
  it('should create a product with valid data', async () => {
    const formData = new FormData();
    formData.append('name', 'Test Product');
    formData.append('price', '99.99');
    
    const mockCreate = jest.fn().mockResolvedValue({ id: '1' });
    (db.product.create as jest.Mock) = mockCreate;
    
    const result = await createProduct(formData);
    
    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Test Product',
        price: 99.99,
      },
    });
  });
  
  it('should return error with invalid data', async () => {
    const formData = new FormData();
    formData.append('name', 'A'); // Too short
    formData.append('price', '-10'); // Negative
    
    const result = await createProduct(formData);
    
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });
});
```

### Integration Testing con Playwright

```tsx
// tests/products.spec.ts
import { test, expect } from '@playwright/test';

test('should display products list', async ({ page }) => {
  await page.goto('/products');
  
  // Attendi che il loading finisca
  await expect(page.getByText('Loading...')).not.toBeVisible();
  
  // Verifica che i prodotti siano visibili
  await expect(page.getByRole('list')).toBeVisible();
  await expect(page.getByText('Product 1')).toBeVisible();
});

test('should create a new product', async ({ page }) => {
  await page.goto('/products/new');
  
  await page.fill('input[name="name"]', 'New Product');
  await page.fill('input[name="price"]', '99.99');
  await page.click('button[type="submit"]');
  
  // Attendi redirect e verifica successo
  await page.waitForURL(/\/products\/\d+/);
  await expect(page.getByText('New Product')).toBeVisible();
});
```

---

## 🚦 Status Codes per API Routes

```tsx
// Usa questi status codes nelle tue API routes

// 2xx Success
200 // OK - Request succeeded
201 // Created - Resource created
204 // No Content - Success but no response body

// 4xx Client Errors
400 // Bad Request - Invalid input/validation error
401 // Unauthorized - Not authenticated
403 // Forbidden - Authenticated but not authorized
404 // Not Found - Resource doesn't exist
409 // Conflict - Resource conflict (duplicate)
422 // Unprocessable Entity - Semantic errors
429 // Too Many Requests - Rate limit exceeded

// 5xx Server Errors
500 // Internal Server Error - Generic server error
502 // Bad Gateway - Invalid response from upstream
503 // Service Unavailable - Server temporarily unavailable

// Esempio pratico
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validation error
    if (!body.email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    
    // Auth check
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Create resource
    const user = await db.user.create({ data: body });
    
    return NextResponse.json(user, { status: 201 });
    
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

---

## 🎯 Final Checklist: Production Ready

Prima di deployare in produzione, verifica:

### Security ✅
- [ ] Tutti gli input sono validati (Zod)
- [ ] Auth check in tutte le routes protette
- [ ] DTO pattern implementato (nessun dato sensibile esposto)
- [ ] NEXT_PUBLIC_* solo per dati non sensibili
- [ ] Error messages non espongono stack traces
- [ ] Rate limiting implementato per API critiche
- [ ] CORS configurato correttamente
- [ ] CSP headers configurati

### Performance ✅
- [ ] Turbopack abilitato per build
- [ ] React Compiler abilitato (opzionale)
- [ ] next/image per tutte le immagini
- [ ] next/font per i font
- [ ] Metadata completi (SEO)
- [ ] Cache strategy definita ("use cache" dove appropriato)
- [ ] Suspense per dati dinamici (no blocking)
- [ ] Database indexes per query frequenti

### Code Quality ✅
- [ ] TypeScript strict mode abilitato
- [ ] ESLint configured e no warnings
- [ ] Prettier configured
- [ ] Git hooks (husky + lint-staged)
- [ ] Tests per Server Actions critiche
- [ ] Error boundaries implementate
- [ ] Loading states per tutte le async operations

### Monitoring ✅
- [ ] Error tracking (Sentry, LogRocket)
- [ ] Analytics (Vercel Analytics, Google Analytics)
- [ ] Performance monitoring (SpeedInsights)
- [ ] Uptime monitoring (UptimeRobot, Checkly)
- [ ] Database monitoring
- [ ] Logging strutturato

### Environment ✅
- [ ] .env.example aggiornato
- [ ] Environment variables documentate
- [ ] Secrets non committati (.gitignore)
- [ ] Production env vars configurate sul provider
- [ ] Backup strategy definita

---

## 📚 Risorse Utili

### Documentazione Ufficiale
- [Next.js Docs](https://nextjs.org/docs)
- [Next.js 16 Release](https://nextjs.org/blog/next-16)
- [React Server Components](https://react.dev/reference/rsc/server-components)
- [Clerk Docs](https://clerk.com/docs)

### Community & Learning
- [Next.js Discord](https://nextjs.org/discord)
- [Next.js GitHub](https://github.com/vercel/next.js)
- [Next.js Examples](https://github.com/vercel/next.js/tree/canary/examples)
- [Vercel Community](https://vercel.com/community)

### Tools & Libraries
- [Zod](https://zod.dev/) - Schema validation
- [Prisma](https://www.prisma.io/) - ORM
- [Drizzle](https://orm.drizzle.team/) - TypeScript ORM
- [Clerk](https://clerk.com/) - Authentication
- [Shadcn/ui](https://ui.shadcn.com/) - Component library
- [TanStack Query](https://tanstack.com/query) - Data fetching (Client)

---

## 🎉 Conclusione

Hai completato il **Next.js 16 Quick Reference**!

### Prossimi Passi:

1. **Bookmark questo documento** - Torna qui ogni volta che inizi un nuovo task
2. **Esplora i moduli dettagliati** secondo le tue necessità
3. **Sperimenta con i pattern** - Crea un progetto di prova
4. **Join la community** - Discord, GitHub Discussions
5. **Stay updated** - Next.js si evolve rapidamente

### Ricorda le 3 Regole d'Oro:

```
1. Server Components by default
   → Usa "use client" solo quando necessario

2. Suspense per dati dinamici
   → Runtime APIs = Suspense obbligatorio

3. Sicurezza first
   → Valida, autentica, autorizza, DTO pattern
```

---

**Happy coding! 🚀**

*Versione: 1.0 | Last Updated: Ottobre 2024 | Next.js 16*