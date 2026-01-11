import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getLeagueManagersWithRosters } from "@/lib/db/services/auction-league.service";
import { getUserAuctionStates } from "@/lib/db/services/auction-states.service";
import { getCurrentActiveAuction } from "@/lib/db/services/bid.service";
import { getAllComplianceStatus } from "@/lib/db/services/penalty.service";
import { currentUser } from "@clerk/nextjs/server";
import { Trophy } from "lucide-react";
import Link from "next/link";
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
  const isAdmin = user.publicMetadata?.role === "admin";
  let isReadOnly = false;

  try {
    // If league ID is in URL, verify user participates in it OR is admin
    if (queriedLeagueId) {
      const participationCheck = await db.execute({
        sql: `SELECT league_id FROM league_participants WHERE user_id = ? AND league_id = ?`,
        args: [user.id, queriedLeagueId],
      });

      if (participationCheck.rows.length > 0) {
        hasLeagues = true;
        leagueId = queriedLeagueId;
        isReadOnly = false;
      } else if (isAdmin) {
        // Check if league exists at all
        const leagueExists = await db.execute({
          sql: `SELECT id FROM auction_leagues WHERE id = ?`,
          args: [queriedLeagueId],
        });
        if (leagueExists.rows.length > 0) {
          hasLeagues = true;
          leagueId = queriedLeagueId;
          isReadOnly = true;
        }
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
        isReadOnly = false;
        shouldRedirect = true;
      } else if (isAdmin) {
        // Fallback for admins with no leagues: pick the first one in the system
        const firstLeagueResult = await db.execute({
          sql: `SELECT id FROM auction_leagues ORDER BY created_at DESC LIMIT 1`,
          args: [],
        });
        if (firstLeagueResult.rows.length > 0) {
          hasLeagues = true;
          leagueId = firstLeagueResult.rows[0].id as number;
          isReadOnly = true;
          shouldRedirect = true;
        }
      }
    }
  } catch (error) {
    console.error("Errore nel verificare la partecipazione alle leghe:", error);
    hasLeagues = false;
  }

  // REDIRECT: Se non c'era URL param ma abbiamo trovato una lega,
  // facciamo redirect per avere sempre l'URL esplicito.
  if (shouldRedirect && leagueId) {
    redirect(`/auctions?league=${leagueId}`);
  }

  if (!hasLeagues || !leagueId) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <Navbar />
        <div className="flex-1 overflow-y-auto">
          <NoLeagueMessage isAdmin={isAdmin} />
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
            isReadOnly={isReadOnly}
            isAdmin={isAdmin}
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

function NoLeagueMessage({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <Trophy className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          {isAdmin ? "Nessuna Lega Trovata" : "Non sei in nessuna Lega"}
        </h2>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Non sono state trovate leghe attive nel sistema."
            : "Non partecipi a nessuna lega attiva al momento."}
        </p>
      </div>
      {!isAdmin && (
        <Button asChild>
          <Link href="/dashboard">Torna alla Dashboard</Link>
        </Button>
      )}
    </div>
  );
}
