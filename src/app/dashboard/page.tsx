// src/app/dashboard/page.tsx v.1.2
// Corretto l'errore di tipo per 'href' con typedRoutes abilitato.
// 1. Importazioni
import { currentUser } from "@clerk/nextjs/server";
import { FileUp, Landmark, Users } from "lucide-react";

import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { Navbar } from "@/components/navbar";
import {
  type DashboardStats,
  getDashboardStats,
} from "@/lib/db/services/admin.service";

// --- Componente Pagina ---
export default async function DashboardPage() {
  const user = await currentUser();
  const stats: DashboardStats = await getDashboardStats();
  const adminFirstName = user?.firstName || "Admin";

  const kpiData = [
    { title: "Utenti Totali", value: stats.totalUsers, icon: Users },
    { title: "Leghe Create", value: stats.totalLeagues, icon: Landmark },
    { title: "Aste Attive", value: stats.activeAuctions, icon: FileUp },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">
          Dashboard Amministrazione
          <span className="text-xl font-normal text-muted-foreground">
            , Benvenuto {adminFirstName}!
          </span>
        </h1>

        {/* Sezione KPI */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {kpiData.map((kpi, index) => (
            <div
              key={index}
              className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {kpi.title}
                </h2>
                <kpi.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mb-1 text-3xl font-semibold">{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto w-full lg:w-5/6">
          <AdminQuickActions />
        </div>
      </main>
    </div>
  );
}
