// src/app/auctions/page.tsx
// Main auction page with responsive layout for live bidding

import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { AuctionPageContent } from "./AuctionPageContent";

export default async function AuctionsPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/devi-autenticarti");
  }

  // Verifica se l'utente partecipa ad almeno una lega
  try {
    // Utilizziamo il servizio DB direttamente per verificare la partecipazione
    const { db } = await import("@/lib/db");
    
    const userLeagues = db
      .prepare(
        `SELECT 1 FROM league_participants WHERE user_id = ? LIMIT 1`
      )
      .get(user.id);
    
    if (!userLeagues) {
      // L'utente è registrato ma non partecipa a nessuna lega
      redirect("/no-access?reason=no-league");
    }
  } catch (error) {
    console.error("Errore nel verificare la partecipazione alle leghe:", error);
    redirect("/no-access");
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<AuctionPageSkeleton />}>
          <AuctionPageContent userId={user.id} />
        </Suspense>
      </div>
    </div>
  );
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
