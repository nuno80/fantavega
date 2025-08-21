// src/app/auctions/page.tsx
// Main auction page with responsive layout for live bidding
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { currentUser } from "@clerk/nextjs/server";

import { Navbar } from "@/components/navbar";

import { AuctionPageContent } from "./AuctionPageContent";

export default async function AuctionsPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/devi-autenticarti");
  }

  // Verifica se l'utente partecipa ad almeno una lega
  let hasLeagues = false;
  try {
    // Utilizziamo il servizio DB direttamente per verificare la partecipazione
    const { db } = await import("@/lib/db");

    const userLeagues = db
      .prepare(`SELECT 1 FROM league_participants WHERE user_id = ? LIMIT 1`)
      .get(user.id);

    hasLeagues = !!userLeagues;
  } catch (error) {
    console.error("Errore nel verificare la partecipazione alle leghe:", error);
    hasLeagues = false;
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Navbar />
      <div className="flex-1 overflow-y-auto">
        {hasLeagues ? (
          <Suspense fallback={<AuctionPageSkeleton />}>
            <AuctionPageContent userId={user.id} />
          </Suspense>
        ) : (
          <NoLeagueMessage />
        )}
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
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
        {/* Bottom Panel Skeleton */}
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
              <svg
                className="h-8 w-8 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 515.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 919.288 0M15 7a3 3 0 11-6 0 3 3 0 616 0zm6 3a2 2 0 11-4 0 2 2 0 414 0zM7 10a2 2 0 11-4 0 2 2 0 414 0z"
                />
              </svg>
            </div>
          </div>

          <h2 className="mb-3 text-2xl font-bold text-foreground">
            Accesso Limitato
          </h2>

          <p className="mb-6 leading-relaxed text-muted-foreground">
            Questa pagina puo essere visualizzata solo da utenti iscritti a una
            lega. Contatta un amministratore per essere aggiunto a una lega
            esistente.
          </p>

          <div className="space-y-3">
            <a
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              Torna alla Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
