// src/app/admin/db-management/page.tsx v.1.0
// Pagina per la gestione del database, che renderizza il form di importazione giocatori.
// 1. Importazioni
import { PlayerImportForm } from "@/components/admin/PlayerImportForm";
import { Navbar } from "@/components/navbar";
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";

// 2. Componente Pagina (Server Component)
export default function DbManagementPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mx-auto grid w-full max-w-6xl gap-2">
          <h1 className="text-3xl font-semibold">Gestione Database</h1>
        </div>

        <AdminQuickActions />

        <div className="mx-auto grid w-full max-w-6xl items-start gap-6">
          {/* Renderizziamo il nostro componente form client-side */}
          <PlayerImportForm />
        </div>
      </main>
    </div>
  );
}
