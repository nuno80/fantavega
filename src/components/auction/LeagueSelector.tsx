"use client";

import { useState } from "react";
import { ChevronDown, Trophy, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface League {
  id: number;
  name: string;
  status: string;
  team_name: string;
  current_budget: number;
  locked_credits: number;
}

interface LeagueSelectorProps {
  leagues: League[];
  selectedLeagueId: number | null;
  onLeagueChange: (leagueId: number) => void;
  isLoading?: boolean;
}

export function LeagueSelector({
  leagues,
  selectedLeagueId,
  onLeagueChange,
  isLoading = false,
}: LeagueSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const currentLeague = leagues.find((league) => league.id === selectedLeagueId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft_active":
        return <Badge variant="outline" className="text-green-500 border-green-500">Asta Attiva</Badge>;
      case "participants_joining":
        return <Badge variant="outline" className="text-yellow-500 border-yellow-500">In Attesa</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-gray-500 border-gray-500">Completata</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleLeagueSelect = (leagueId: number) => {
    onLeagueChange(leagueId);
    setIsOpen(false);
    
    // Save to localStorage for persistence
    localStorage.setItem('selectedLeagueId', leagueId.toString());
  };

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Caricamento leghe...</span>
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div className="flex items-center space-x-2 text-muted-foreground">
        <Trophy className="h-4 w-4" />
        <span className="text-sm">Nessuna lega disponibile</span>
      </div>
    );
  }

  if (leagues.length === 1) {
    // Single league - no dropdown needed
    const league = leagues[0];
    return (
      <div className="flex items-center space-x-2">
        <Trophy className="h-4 w-4 text-primary" />
        <span className="font-medium">{league.name}</span>
        <span className="text-sm text-muted-foreground">({league.team_name})</span>
        {getStatusBadge(league.status)}
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="justify-between min-w-[200px]">
          <div className="flex items-center space-x-2">
            <Trophy className="h-4 w-4" />
            <span className="font-medium">
              {currentLeague ? currentLeague.name : "Seleziona Lega"}
            </span>
            {currentLeague && (
              <span className="text-sm text-muted-foreground">
                ({currentLeague.team_name})
              </span>
            )}
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {leagues.map((league) => (
          <DropdownMenuItem
            key={league.id}
            onClick={() => handleLeagueSelect(league.id)}
            className={`cursor-pointer p-3 ${
              league.id === selectedLeagueId ? "bg-accent" : ""
            }`}
          >
            <div className="flex w-full items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Trophy className="h-4 w-4" />
                  <span className="font-medium">{league.name}</span>
                  {league.id === selectedLeagueId && (
                    <Badge variant="secondary">Attuale</Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center space-x-4 text-xs text-muted-foreground">
                  <span className="flex items-center space-x-1">
                    <Users className="h-3 w-3" />
                    <span>{league.team_name}</span>
                  </span>
                  <span>Budget: {league.current_budget}</span>
                  {league.locked_credits > 0 && (
                    <span>Bloccati: {league.locked_credits}</span>
                  )}
                </div>
                <div className="mt-2">
                  {getStatusBadge(league.status)}
                </div>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}