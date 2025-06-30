// src/app/dashboard/page.tsx v.1.2
// Corretto l'errore di tipo per 'href' con typedRoutes abilitato.
// 1. Importazioni
import Link from "next/link";

import { currentUser } from "@clerk/nextjs/server";
import {
  Database,
  FileUp,
  Landmark,
  LayoutGrid,
  Trophy,
  Users,
  Users2,
} from "lucide-react";

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

  // MODIFICA CHIAVE: Aggiunto 'as const' per aiutare TypeScript
  // a inferire i tipi delle stringhe href come letterali e non come stringhe generiche.
  const navLinks = [
    { title: "Crea Nuova Lega", href: "/admin/leagues/create", icon: Trophy },
    { title: "Gestione Utenti", href: "/admin/users", icon: Users2 },
    {
      title: "Gestione DB (Upload)",
      href: "/admin/db-management",
      icon: Database,
    },
    { title: "Gestione Leghe", href: "/admin/leagues", icon: LayoutGrid },
  ] as const;

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-foreground">
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

        {/* Sezione Navigazione Admin */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Azioni Rapide
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {navLinks.map((link, index) => (
              <Link key={index} href={link.href} className="group">
                <div className="flex h-full transform flex-col items-center justify-center rounded-lg border bg-card p-6 text-center shadow-sm transition-transform group-hover:scale-105">
                  <link.icon className="mb-2 h-8 w-8 text-muted-foreground" />
                  <h3 className="font-semibold text-card-foreground">
                    {link.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
