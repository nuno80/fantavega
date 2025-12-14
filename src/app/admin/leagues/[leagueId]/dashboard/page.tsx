// src/app/admin/leagues/[leagueId]/dashboard/page.tsx v.1.8 (Edit Settings)
// Versione completa della dashboard di gestione lega con modifica impostazioni.
// 1. Importazioni
import { notFound } from "next/navigation";

import { Clock, Landmark, ShieldCheck, Users } from "lucide-react";

import { EditLeagueSetting } from "@/components/admin/EditLeagueSetting";
import { EditTeamName } from "@/components/admin/EditTeamName";
import { LeagueActiveRolesManager } from "@/components/admin/LeagueActiveRolesManager";
import { LeagueStatusManager } from "@/components/admin/LeagueStatusManager";
import { RemoveParticipant } from "@/components/admin/RemoveParticipant";
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

  // Condizione per mostrare i controlli di gestione dei partecipanti
  const canManageParticipants = league.status === "participants_joining";

  // 3.2. JSX completo e aggiornato
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
            className="text-sm capitalize"
          >
            {league.status.replace(/_/g, " ")}
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
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">
                  {league.initialBudget} cr
                </span>
                {canManageParticipants && (
                  <EditLeagueSetting
                    leagueId={league.id}
                    settingName="initial_budget_per_manager"
                    settingLabel="Budget Iniziale"
                    currentValue={league.initialBudget}
                    inputType="number"
                    unit="crediti"
                  />
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Timer Asta</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">
                  {league.timerDurationMinutes} min
                </span>
                {canManageParticipants && (
                  <EditLeagueSetting
                    leagueId={league.id}
                    settingName="timer_duration_minutes"
                    settingLabel="Timer Asta"
                    currentValue={league.timerDurationMinutes}
                    inputType="number"
                    unit="minuti"
                  />
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tipo Lega</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold capitalize">
                  {league.leagueType}
                </span>
                {canManageParticipants && (
                  <EditLeagueSetting
                    leagueId={league.id}
                    settingName="league_type"
                    settingLabel="Tipo Lega"
                    currentValue={league.leagueType}
                    inputType="select"
                    selectOptions={[
                      { value: "classic", label: "Classic" },
                      { value: "mantra", label: "Mantra" },
                    ]}
                  />
                )}
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
                {canManageParticipants && (
                  <AddParticipantForm
                    leagueId={league.id}
                    eligibleUsers={eligibleUsers}
                  />
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Nome Squadra</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {league.participants.map((p) => (
                      <TableRow key={p.userId}>
                        <TableCell className="font-medium">
                          {p.username || "N/D"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <span>{p.teamName || "Da definire"}</span>
                            <EditTeamName
                              leagueId={league.id}
                              participantUserId={p.userId}
                              currentTeamName={p.teamName}
                            />
                          </div>
                        </TableCell>
                        <TableCell>{p.currentBudget} cr</TableCell>
                        <TableCell className="text-right">
                          {canManageParticipants && (
                            <RemoveParticipant
                              leagueId={league.id}
                              participantUserId={p.userId}
                              participantUsername={p.username}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Colonna destra: Gestione Lega */}
          <div className="space-y-4 lg:col-span-3">
            <LeagueStatusManager
              leagueId={league.id}
              currentStatus={league.status}
            />
            <LeagueActiveRolesManager
              leagueId={league.id}
              currentActiveRoles={league.activeAuctionRoles}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
