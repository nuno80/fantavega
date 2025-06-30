// src/app/admin/leagues/create/page.tsx v.1.0
// Pagina per la creazione di una nuova lega, che renderizza il form.
// 1. Importazioni
import { CreateLeagueForm } from "@/components/forms/CreateLeagueForm";
import { Navbar } from "@/components/navbar";

// Assumiamo esista una Navbar

// 2. Componente Pagina
export default function CreateLeaguePage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {/* Renderizziamo il nostro componente form client-side */}
        <CreateLeagueForm />
      </main>
    </div>
  );
}
