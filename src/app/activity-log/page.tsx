// src/app/activity-log/page.tsx v.1.0
// Pagina Activity Log — accessibile a tutti i partecipanti di una lega.
// 1. Importazioni
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ActivityLogClient } from "@/components/activity-log/ActivityLogClient";
import { Navbar } from "@/components/navbar";
import { db } from "@/lib/db";

// 2. Componente Pagina (Server Component)
export default async function ActivityLogPage(props: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/devi-autenticarti");
  }

  const searchParams = await props.searchParams;
  const isAdmin = user.publicMetadata?.role === "admin";
  let leagueId: number | null = null;

  const queriedLeagueId = searchParams.league
    ? parseInt(searchParams.league)
    : null;

  try {
    if (queriedLeagueId) {
      // Verifica che l'utente partecipi alla lega o sia admin
      const participationCheck = await db.execute({
        sql: `SELECT league_id FROM league_participants WHERE user_id = ? AND league_id = ?`,
        args: [user.id, queriedLeagueId],
      });

      if (participationCheck.rows.length > 0) {
        leagueId = queriedLeagueId;
      } else if (isAdmin) {
        const leagueExists = await db.execute({
          sql: `SELECT id FROM auction_leagues WHERE id = ?`,
          args: [queriedLeagueId],
        });
        if (leagueExists.rows.length > 0) {
          leagueId = queriedLeagueId;
        }
      }
    }

    // Fallback: prima lega dell'utente
    if (!leagueId) {
      const userLeaguesResult = await db.execute({
        sql: `SELECT league_id FROM league_participants WHERE user_id = ? LIMIT 1`,
        args: [user.id],
      });

      if (userLeaguesResult.rows.length > 0) {
        leagueId = userLeaguesResult.rows[0].league_id as number;
        redirect(`/activity-log?league=${leagueId}`);
      } else if (isAdmin) {
        const firstLeagueResult = await db.execute({
          sql: `SELECT id FROM auction_leagues ORDER BY created_at DESC LIMIT 1`,
          args: [],
        });
        if (firstLeagueResult.rows.length > 0) {
          leagueId = firstLeagueResult.rows[0].id as number;
          redirect(`/activity-log?league=${leagueId}`);
        }
      }
    }
  } catch (error) {
    // redirect() di Next.js lancia un errore speciale che deve propagarsi
    // Lo rilanciamo sempre per sicurezza, e logghiamo solo errori genuini
    const isRedirectError = error instanceof Error &&
      (error.message.includes("NEXT_REDIRECT") || (error as unknown as { digest?: string }).digest === "NEXT_REDIRECT");
    if (isRedirectError) {
      throw error;
    }
    console.error("Errore nel verificare l'accesso alla lega:", error);
  }

  if (!leagueId) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">
              Nessuna lega trovata
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Per visualizzare il log attività devi partecipare ad una lega.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <ActivityLogClient leagueId={leagueId} />
      </main>
    </div>
  );
}
