// src/app/admin/db-management/page.tsx v.1.1
// Pagina per la gestione del database: import aggiornamento (in stagione)
// e reset catalogo (inizio stagione).

// 1. Importazioni
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { PlayerImportForm } from "@/components/admin/PlayerImportForm";
import { PlayerResetForm } from "@/components/admin/PlayerResetForm";
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
          {/* Update in stagione (logica attuale: upsert + orfani) */}
          <PlayerImportForm />

          {/* Reset inizio stagione (svuota catalogo + rose, poi importa) */}
          <PlayerResetForm />
        </div>
      </main>
    </div>
  );
}
