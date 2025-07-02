// src/app/admin/leagues/[leagueId]/dashboard/page.tsx v.1.3
// Aggiunto il componente per la gestione dello stato della lega in un layout a griglia.
// 1. Importazioni
import { notFound } from "next/navigation";

import { Clock, Landmark, ShieldCheck, Users } from "lucide-react";

import { LeagueStatusManager } from "@/components/admin/LeagueStatusManager";
// <-- NUOVA IMPORTAZIONE
import { AddParticipantForm } from "@/components/forms/AddParticipantForm";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLeagueDetailsForAdminDashboard } from "@/lib/db/services/auction-league.service";
import { getEligibleUsersForLeague } from "@/lib/db/services/user.service";

// 2. Definizione delle Props della Pagina
interface LeagueDashboardPageProps {
  params: Promise<{ leagueId: string }>;
}

// 3. Componente Pagina (Server Component)
export default async function LeagueDashboardPage({
  params,
}: LeagueDashboardPageProps) {
  const { leagueId: leagueIdString } = await params;
  const leagueId = parseInt(leagueIdString, 10);

  if (isNaN(leagueId)) {
    notFound();
  }

  // 3.1. Data fetching diretto
  const league = await getLeagueDetailsForAdminDashboard(leagueId);
  const eligibleUsers = await getEligibleUsersForLeague(leagueId);

  if (!league) {
    notFound();
  }

  // 3.2. JSX aggiornato con layout a griglia
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {league.name}
            </h1>
            <p className="text-muted-foreground">Dashboard di Gestione</p>
          </div>
          <Badge
            variant={
              league.status === "participants_joining" ? "default" : "secondary"
            }
            className="text-sm"
          >
            Stato: {league.status.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Statistiche */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Partecipanti
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {league.participants.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Budget Iniziale
              </CardTitle>
              <Landmark className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {league.initialBudget} cr
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Timer Asta</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {league.timerDurationMinutes} min
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tipo Lega</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {league.leagueType}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sezione Gestione a Griglia */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-7 lg:gap-8">
          {/* Colonna sinistra: Tabella Partecipanti */}
          <div className="lg:col-span-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Lista Partecipanti</CardTitle>
                  <CardDescription>
                    Manager iscritti a questa lega.
                  </CardDescription>
                </div>
                <AddParticipantForm
                  leagueId={league.id}
                  eligibleUsers={eligibleUsers}
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Nome Squadra</TableHead>
                      <TableHead>Budget Corrente</TableHead>
                      <TableHead>Crediti Bloccati</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {league.participants.map((p) => (
                      <TableRow key={p.userId}>
                        <TableCell className="font-medium">
                          {p.username || "N/D"}
                        </TableCell>
                        <TableCell>{p.teamName || "Da definire"}</TableCell>
                        <TableCell>{p.currentBudget} cr</TableCell>
                        <TableCell>{p.lockedCredits} cr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Colonna destra: Gestione Stato */}
          <div className="lg:col-span-3">
            <LeagueStatusManager
              leagueId={league.id}
              currentStatus={league.status}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
