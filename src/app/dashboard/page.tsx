import { currentUser } from "@clerk/nextjs/server";
import {
  Users,
  LayoutGrid,
  Database,
  Users2,
  FileUp,
  Landmark,
  Gavel,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { DashboardStats } from "@/lib/db/services/admin.service";

// --- Funzione per recuperare i dati ---
async function getStats(): Promise<DashboardStats> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const res = await fetch(`${appUrl}/api/admin/dashboard-stats`, {
      cache: 'no-store', // Assicura che i dati siano sempre freschi
    });

    if (!res.ok) {
      throw new Error("Failed to fetch stats");
    }
    return res.json();
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    // Ritorna valori di default in caso di errore per non rompere la UI
    return {
      totalUsers: 0,
      totalLeagues: 0,
      activeAuctions: 0,
    };
  }
}

// --- Componente Pagina ---
export default async function DashboardPage() {
  const user = await currentUser();
  const adminFirstName = user?.firstName || "Admin";
  const stats = await getStats();

  const kpiData = [
    {
      title: "Utenti Totali",
      value: stats.totalUsers,
      icon: Users,
    },
    {
      title: "Leghe Create",
      value: stats.totalLeagues,
      icon: Landmark,
    },
    {
      title: "Aste Attive",
      value: stats.activeAuctions,
      icon: FileUp,
    },
  ];

  const navLinks = [
    {
      title: "Crea Nuova Lega",
      href: "/admin/leagues/create",
      icon: Trophy,
    },
    {
      title: "Gestione Utenti",
      href: "/admin/users",
      icon: Users2,
    },
    {
      title: "Gestione DB (Upload)",
      href: "/admin/db-management",
      icon: Database,
    },
    {
      title: "Gestione Leghe",
      href: "/admin/leagues",
      icon: LayoutGrid,
    },
  ];

  return (
    <div>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-white">
          Dashboard Amministrazione
          {adminFirstName && (
            <span className="text-xl font-normal text-gray-200">
              , Benvenuto {adminFirstName}!
            </span>
          )}
        </h1>

        {/* Sezione KPI */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {kpiData.map((kpi, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-800">
                  {kpi.title}
                </h2>
                <kpi.icon className="h-5 w-5 text-gray-600" />
              </div>
              <p className="mb-1 text-3xl font-semibold text-black">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Sezione Navigazione Admin */}
        <div className="mb-8">
          <h2 className="mb-4 text-xl font-semibold text-black">Azioni Rapide</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {navLinks.map((link, index) => (
              // @ts-ignore
              <Link key={index} href={link.href}>
                <div className="flex h-full transform cursor-pointer flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-6 text-center shadow-md transition-transform hover:scale-105">
                  <link.icon className="mb-2 h-8 w-8 text-gray-700" />
                  <h3 className="font-semibold text-black">{link.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
