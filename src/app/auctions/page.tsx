import { Navbar } from "@/components/navbar";
import { db } from "@/lib/db";
import { getLeagueManagersWithRosters } from "@/lib/db/services/auction-league.service";
import { getUserAuctionStates } from "@/lib/db/services/auction-states.service";
import { getCurrentActiveAuction } from "@/lib/db/services/bid.service";
import { getAllComplianceStatus } from "@/lib/db/services/penalty.service";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuctionPageContent } from "./AuctionPageContent";

export default async function AuctionsPage2(props: {
  searchParams: Promise<{ league?: string }>;
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/devi-autenticarti");
  }




  const searchParams = await props.searchParams;
  let hasLeagues = false;
  let leagueId: number | null = null;
  let shouldRedirect = false;
  const queriedLeagueId = searchParams.league ? parseInt(searchParams.league) : null;

  try {
    // If league ID is in URL, verify user participates in it
    if (queriedLeagueId) {
      const participationCheck = await db.execute({
        sql: `SELECT league_id FROM league_participants WHERE user_id = ? AND league_id = ?`,
        args: [user.id, queriedLeagueId],
      });

      if (participationCheck.rows.length > 0) {
        hasLeagues = true;
        leagueId = queriedLeagueId;
      }
    }

    // Fallback: Check if user has leagues and get the first one if no valid URL param
    if (!leagueId) {
      const userLeaguesResult = await db.execute({
        sql: `SELECT league_id FROM league_participants WHERE user_id = ? LIMIT 1`,
        args: [user.id],
      });

      if (userLeaguesResult.rows.length > 0) {
        hasLeagues = true;
        leagueId = userLeaguesResult.rows[0].league_id as number;
        shouldRedirect = true; // Segna per redirect dopo il try-catch
      }
    }
  } catch (error) {
    console.error("Errore nel verificare la partecipazione alle leghe:", error);
    hasLeagues = false;
  }

  // REDIRECT: Se non c'era URL param ma abbiamo trovato una lega,
  // facciamo redirect per avere sempre l'URL esplicito.
  // NOTA: redirect() lancia un'eccezione interna, quindi deve stare FUORI dal try-catch!
  if (shouldRedirect && leagueId) {
    redirect(`/auctions?league=${leagueId}`);
  }

  if (!hasLeagues || !leagueId) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Navbar />
        <div className="flex-1 overflow-y-auto">
          <NoLeagueMessage />
        </div>
      </div>
    );
  }

  // Fetch initial data for the league
  // We use Promise.all to fetch data in parallel
  const [
    managersData,
    currentAuction,
    complianceData,
    userAuctionStates
  ] = await Promise.all([
    getLeagueManagersWithRosters(leagueId),
    getCurrentActiveAuction(leagueId),
    getAllComplianceStatus(leagueId),
    getUserAuctionStates(user.id, leagueId)
  ]);

  // Sanitize managers data to prevent leaking locked_credits
  const sanitizedManagers = managersData.managers.map((manager) => ({
    ...manager,
    locked_credits: manager.user_id === user.id ? manager.locked_credits : 0,
  }));

  // Serialize all data to plain objects to avoid React Server Component errors
  const serializedData = JSON.parse(JSON.stringify({
    managers: sanitizedManagers,
    leagueSlots: managersData.leagueSlots,
    activeAuctions: managersData.activeAuctions,
    autoBids: managersData.autoBids,
    leagueStatus: managersData.leagueStatus,
    currentAuction,
    complianceData,
    userAuctionStates
  }));

  return (
    <div className="flex h-screen flex-col bg-background">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<AuctionPageSkeleton />}>
          <AuctionPageContent
            userId={user.id}
            initialLeagueId={leagueId}
            initialManagers={serializedData.managers}
            initialLeagueSlots={serializedData.leagueSlots}
            initialActiveAuctions={serializedData.activeAuctions}
            initialAutoBids={serializedData.autoBids}
            initialCurrentAuction={serializedData.currentAuction}
            initialComplianceData={serializedData.complianceData}
            initialUserAuctionStates={serializedData.userAuctionStates}
            initialLeagueStatus={serializedData.leagueStatus}
          />
        </Suspense>
      </div>
    </div>
  );
}

function AuctionPageSkeleton() {
  return (
    <div className="container px-4 py-6">
      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-6">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}

function NoLeagueMessage() {
  return (
    <div className="container px-4 py-6">
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mx-auto max-w-md">
          <div className="mb-6">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
              </svg>
            </div>
          </div>
          <h2 className="mb-3 text-2xl font-bold text-foreground">Accesso Limitato</h2>
          <p className="mb-6 leading-relaxed text-muted-foreground">
            Questa pagina puo essere visualizzata solo da utenti iscritti a una lega. Contatta un amministratore per essere aggiunto a una lega esistente.
          </p>
          <div className="space-y-3">
            <a href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
              Torna alla Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
