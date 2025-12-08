"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Check, ChevronDown, Shield } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface League {
  id: number;
  name: string;
  status: string;
  team_name?: string;
  current_budget: number;
  locked_credits: number;
}

interface LeagueSelectorProps {
  currentLeagueId?: number | null;
  onLeagueChange?: (leagueId: number) => void;
  compact?: boolean;
}

export function LeagueSelector({
  currentLeagueId,
  onLeagueChange,
  compact = false,
}: LeagueSelectorProps) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentLeague, setCurrentLeague] = useState<League | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlLeagueId = searchParams.get("league")
    ? parseInt(searchParams.get("league")!, 10)
    : null;
  const effectiveLeagueId = currentLeagueId || urlLeagueId;

  useEffect(() => {
    const fetchUserLeagues = async () => {
      try {
        const response = await fetch("/api/user/leagues");
        if (response.ok) {
          const leagueData = await response.json();
          setLeagues(leagueData);

          // Set current league if provided or use first league
          if (effectiveLeagueId) {
            const league = leagueData.find(
              (l: League) => l.id === effectiveLeagueId
            );
            setCurrentLeague(league || null);
          } else if (leagueData.length > 0) {
            setCurrentLeague(leagueData[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching user leagues:", error);
        toast.error("Errore nel caricamento delle leghe");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserLeagues();
  }, [effectiveLeagueId]);

  const handleLeagueSelect = (league: League) => {
    setCurrentLeague(league);

    if (onLeagueChange) {
      onLeagueChange(league.id);
    } else {
      // Default behavior: navigate to auctions page with league context
      router.push(`/auctions?league=${league.id}`);
    }

    // Toast rimosso - la pagina naviga già mostrando la nuova lega
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft_active":
        return "bg-green-500";
      case "repair_active":
        return "bg-blue-500";
      case "participants_joining":
        return "bg-yellow-500";
      case "market_closed":
        return "bg-gray-500";
      case "season_active":
        return "bg-purple-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        {!compact && <span className="ml-2">Caricamento...</span>}
      </Button>
    );
  }

  if (leagues.length === 0) {
    return null; // Don't show if user has no leagues
  }

  if (leagues.length === 1) {
    // Don't show dropdown if user only has one league
    return compact ? null : (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>{leagues[0].name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-sm font-medium hover:bg-muted"
        >
          <Shield className="h-4 w-4" />
          {!compact && currentLeague && (
            <span className="max-w-[120px] truncate">{currentLeague.name}</span>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Le Tue Leghe
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {leagues.map((league) => (
          <DropdownMenuItem
            key={league.id}
            className="flex cursor-pointer flex-col items-start gap-2 p-3"
            onClick={() => handleLeagueSelect(league)}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="font-medium">{league.name}</div>
                {currentLeague?.id === league.id && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </div>
              <Badge
                variant="secondary"
                className={`text-xs ${getStatusColor(league.status)} text-white`}
              >
                {getStatusLabel(league.status)}
              </Badge>
            </div>

            <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
              <span>{league.team_name || "Squadra senza nome"}</span>
              <span>Budget: {league.current_budget} cr</span>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-center text-xs text-muted-foreground"
          disabled
        >
          {leagues.length} lega{leagues.length !== 1 ? "he" : ""} disponibile
          {leagues.length !== 1 ? "i" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
