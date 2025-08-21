"use client";

import { ReactNode } from "react";

import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AuctionLayoutProps {
  children: ReactNode;
  leagueName?: string;
  onTeamManagement?: () => void;
}

export function AuctionLayout({
  children,
  leagueName,
  onTeamManagement,
}: AuctionLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-16 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Aste Live</h1>
            {leagueName && (
              <span className="text-sm text-muted-foreground">
                • {leagueName}
              </span>
            )}
          </div>

          {onTeamManagement && (
            <Button
              onClick={onTeamManagement}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Gestione Squadra
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-6">{children}</main>
    </div>
  );
}
