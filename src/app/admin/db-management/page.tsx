// src/app/admin/db-management/page.tsx v.1.0
// Pagina per la gestione del database, che renderizza il form di importazione giocatori.
// 1. Importazioni
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { PlayerImportForm } from "@/components/admin/PlayerImportForm";
import { Navbar } from "@/components/navbar";

// 2. Componente Pagina (Server Component)
export default function DbManagementPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">
          Gestione Database
        </h1>

        <div className="mx-auto w-full lg:w-5/6">
          <AdminQuickActions />
        </div>

        <div className="mx-auto grid w-full max-w-6xl items-start gap-6">
          {/* Renderizziamo il nostro componente form client-side */}
          <PlayerImportForm />
        </div>
      </main>
    </div>
  );
}
