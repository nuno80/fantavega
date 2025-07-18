// src/app/admin/leagues/page.tsx v.1.1
// Pagina per visualizzare e gestire tutte le leghe create.
// 1. Importazioni
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";

import { ArrowRight, PlusCircle } from "lucide-react";

import { Navbar } from "@/components/navbar";
import { DeleteLeague } from "@/components/admin/DeleteLeague";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getLeaguesForAdminList } from "@/lib/db/services/auction-league.service";

// 2. Componente Pagina (Server Component)
export default async function AdminLeaguesPage() {
  // 2.1. Recupero dati diretto
  const user = await currentUser();
  const leagues = await getLeaguesForAdminList();

  // 2.2. JSX per la visualizzazione
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex items-center">
          <h1 className="text-lg font-semibold md:text-2xl">Gestione Leghe</h1>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/admin/leagues/create">
              <Button size="sm" className="h-8 gap-1">
                <PlusCircle className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Crea Nuova Lega
                </span>
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tutte le Leghe</CardTitle>
            <CardDescription>
              Visualizza e gestisci tutte le leghe d&apos;asta create nel sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Lega</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-center">Partecipanti</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leagues.length > 0 ? (
                  leagues.map((league) => (
                    <TableRow key={league.id}>
                      <TableCell className="font-medium">
                        {league.name}
                      </TableCell>
                      <TableCell className="capitalize">
                        {league.leagueType}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            league.status === "draft_active"
                              ? "default"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {league.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {league.participantCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/leagues/${league.id}/dashboard`}>
                            <Button variant="outline" size="sm">
                              <ArrowRight className="h-4 w-4 mr-1" />
                              Gestisci
                            </Button>
                          </Link>
                          {user && (
                            <DeleteLeague
                              leagueId={league.id}
                              leagueName={league.name}
                              participantCount={league.participantCount}
                              isCreator={league.adminCreatorId === user.id}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Nessuna lega trovata. Inizia creandone una nuova.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
