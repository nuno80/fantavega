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

  // Check if user has manager role
  const userRole = user.publicMetadata?.role as string;
  if (userRole !== "manager" && userRole !== "admin") {
    redirect("/no-access");
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Suspense fallback={<AuctionPageSkeleton />}>
        <AuctionPageContent userId={user.id} />
      </Suspense>
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
