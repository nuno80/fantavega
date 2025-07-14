// src/app/auctions/page.tsx
// Main auction page with responsive layout for live bidding

import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { AuctionPageContent, type InitialAuctionData } from "./AuctionPageContent";
import * as leagueService from "@/lib/db/services/auction-league.service";
import * as budgetService from "@/lib/db/services/budget.service";
import * as auctionStateService from "@/lib/db/services/auction-states.service";
import * as bidService from "@/lib/db/services/bid.service";
import type { BidRecord } from "@/lib/db/services/bid.service";
import * as userService from "@/lib/db/services/user.service";

async function getAuctionPageData(userId: string): Promise<InitialAuctionData> {
  const userLeagues = await userService.getUserLeagues(userId);
  if (userLeagues.length === 0) {
    throw new Error("User not in any league");
  }
  const league = userLeagues[0]; // Use the first league for now

  const [
    managersData,
    userAuctionStates,
    userBudget,
    currentAuction,
  ] = await Promise.all([
    leagueService.getLeagueManagersAndData(league.id),
    auctionStateService.getAllUserAuctionStatesForLeague(userId, league.id),
    budgetService.getUserBudgetForLeague(userId, league.id),
    bidService.getCurrentAuction(league.id),
  ]);

  let bidHistory: BidRecord[] = [];
  let userAutoBid = null;

  if (currentAuction?.player_id) {
    const [bids, autoBid] = await Promise.all([
      bidService.getBidsForPlayer(league.id, currentAuction.player_id),
      bidService.getUserAutoBidForPlayer(userId, league.id, currentAuction.player_id)
    ]);
    bidHistory = bids;
    userAutoBid = autoBid;
  }

  return {
    leagues: userLeagues,
    leagueInfo: league,
    managers: managersData.managers,
    leagueSlots: managersData.leagueSlots,
    activeAuctions: managersData.activeAuctions,
    autoBids: managersData.autoBids,
    userAuctionStates: userAuctionStates.states,
    userBudget,
    currentAuction,
    bidHistory,
    userAutoBid,
  };
}

export default async function AuctionsPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/devi-autenticarti");
  }

  try {
    const initialData = await getAuctionPageData(user.id);
    
    return (
      <div className="flex flex-col h-screen bg-background">
        <Navbar />
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<AuctionPageSkeleton />}>
            <AuctionPageContent userId={user.id} initialData={initialData} />
          </Suspense>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Errore nel caricamento dati per la pagina aste:", error);
    if ((error as Error).message === "User not in any league") {
      redirect("/no-access?reason=no-league");
    }
    redirect("/no-access");
  }
}

function AuctionPageSkeleton() {
  return (
    <div className="container px-4 py-6">
      <div className="grid grid-cols-1 gap-6">
        {/* Top Panel Skeleton */}
        <div className="space-y-6">
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-64 bg-muted animate-pulse rounded-lg" />
          <div className="h-32 bg-muted animate-pulse rounded-lg" />
        </div>
        {/* Bottom Panel Skeleton */}
        <div className="space-y-6">
          <div className="h-96 bg-muted animate-pulse rounded-lg" />
          <div className="h-64 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  );
}
