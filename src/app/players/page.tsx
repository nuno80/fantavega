// src/app/players/page.tsx
// Main player search and management page
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { currentUser } from "@clerk/nextjs/server";

import { Navbar } from "@/components/navbar";

import { PlayerSearchInterface } from "./PlayerSearchInterface";

export default async function PlayersPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/devi-autenticarti");
  }

  // Tutti gli utenti registrati possono accedere alla pagina dei giocatori
  // Otteniamo il ruolo dell'utente per passarlo all'interfaccia
  const userRole = (user.publicMetadata?.role as string) || "user";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Suspense fallback={<PlayerSearchSkeleton />}>
        <PlayerSearchInterface userId={user.id} userRole={userRole} />
      </Suspense>
    </div>
  );
}

function PlayerSearchSkeleton() {
  return (
    <div className="container px-4 py-6">
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />

        {/* Search Bar Skeleton */}
        <div className="h-12 animate-pulse rounded-lg bg-muted" />

        {/* Filters Skeleton */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>

        {/* Results Skeleton */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
