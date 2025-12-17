# src/components - User Interface & Shared UI

## Package Identity
- **Role**: Reusable UI components, Shadcn primitives, and feature-specific display logic.
- **Tech**: React 19, Tailwind CSS, Radix UI (via Shadcn).

## Conventions
- **Client vs Server**:
  - Most interactive UI components (dropdowns, dialogs, forms) need `'use client'`.
  - purely presentational components can remain Server Components if they don't use hooks.
- **Naming**: PascalCase for components (e.g., `PlayerCard.tsx`).
- **Shadcn**:
  - Found in `src/components/ui/`.
  - DO NOT modify `ui/` files heavily unless necessary for theming.
  - Compostion over modification.

## Folder Structure
- `ui/`: Base primitives (Button, Input, Dialog).
- `auction/`: Specific components for the Auction page (ManagerColumn, CallPlayerInterface).
- `forms/`: Form components using `react-hook-form` + `zod`.
- `leagues/`: League dashboard widgets.

## Patterns
- **Forms**:
  - ✅ DO: Use `Form`, `FormControl`, `FormField` from Shadcn.
  - ✅ Example: `src/components/forms/CreateLeagueForm.tsx`.
- **Modals**:
  - Use `Dialog` or `Sheet` from `ui/`.
  - Control open state via props or `useState`.

## JIT Index Hints
- Find Shadcn component: `rg "export.*function" src/components/ui`
- Find form: `rg "useForm" src/components`
