// src/app/players/page.tsx
// Main player search and management page

import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Navbar } from "@/components/navbar";
import { PlayerSearchInterface } from "./PlayerSearchInterface";

export default async function PlayersPage() {
  const user = await currentUser();
  
  if (!user) {
    redirect("/devi-autenticarti");
  }

  // Check if user has manager or admin role
  const userRole = user.publicMetadata?.role as string;
  if (userRole !== "manager" && userRole !== "admin") {
    redirect("/no-access");
  }

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
        <div className="h-8 bg-muted animate-pulse rounded-lg w-64" />
        
        {/* Search Bar Skeleton */}
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
        
        {/* Filters Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        
        {/* Results Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}