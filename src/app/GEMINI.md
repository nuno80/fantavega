# src/app - Application Logic & Routes

## Package Identity
- **Role**: Entry point for all Routes, Pages, Layouts, and API endpoints.
- **Tech**: Next.js 15 App Router (Server Components default).

## Conventions
- **Server Components**: Default. Use `async function Page()` or `Layout()`.
- **Client Components**: Explicitly mark with `'use client'` at the top.
- **Data Fetching**:
  - ✅ DO: Fetch data directly in Server Components using `await db.select(...)`.
  - ❌ DON'T: Use `useEffect` for initial data fetching (unless absolutely necessary for client-only state).
- **Server Actions**:
  - Located in `src/lib/actions` but invoked here.
  - Use for form mutations.

## Folder Structure
- `api/`: Backend API routes (Route Handlers).
- `(auth)/`: Route groups for authentication pages (login/signup) - ignored by URL path.
- `dashboard/`: Protected dashboard pages.
- `auctions/`: The main auction interface.

## JIT Index Hints
- Find a Page: `rg "export default.*function.*Page" src/app`
- Find an API Route: `rg "export async function (GET|POST)" src/app/api`
- Find a Layout: `rg "export default.*function.*Layout" src/app`

## Common Gotchas
- **Layouts do not re-render** on navigation; use `template.tsx` if you need state reset.
- Dynamic routes use `[param]` syntax (e.g., `src/app/leagues/[id]/page.tsx`).
