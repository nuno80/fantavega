import Link from "next/link";

import { Database, Download, LayoutGrid, Trophy, Users2 } from "lucide-react";

const quickActions = [
  { title: "Crea Nuova Lega", href: "/admin/leagues/create", icon: Trophy },
  { title: "Gestione Utenti", href: "/admin/users", icon: Users2 },
  {
    title: "Gestione DB (Upload)",
    href: "/admin/db-management",
    icon: Database,
  },
  { title: "Gestione Leghe", href: "/admin/leagues", icon: LayoutGrid },
  { title: "Esporta / Importa Squadre", href: "/admin/teams-export", icon: Download },
] as const;

export function AdminQuickActions() {
  return (
    <div className="mb-8">
      <h2 className="mb-4 text-xl font-semibold text-foreground">
        Azioni Rapide
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((link, index) => (
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
  );
}
