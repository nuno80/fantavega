import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

interface League {
  id: number;
  name: string;
  status: string;
  min_bid: number;
  team_name?: string;
  current_budget: number;
  locked_credits: number;
}

export function useLeague() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchUserLeagues = useCallback(async () => {
    try {
      const response = await fetch("/api/user/leagues");
      if (response.ok) {
        const leagueData = await response.json();
        setLeagues(leagueData);

        // Set current league if provided in URL or use first league
        const leagueParam = searchParams.get("league");
        if (leagueParam) {
          const paramLeagueId = parseInt(leagueParam, 10);
          const foundLeague = leagueData.find(
            (l: League) => l.id === paramLeagueId
          );
          if (foundLeague) {
            setSelectedLeagueId(foundLeague.id);
            return foundLeague.id;
          }
        }

        // Default to first league if no param or invalid param
        if (leagueData.length > 0) {
          setSelectedLeagueId(leagueData[0].id);
          return leagueData[0].id;
        }
      }
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      toast.error("Errore nel caricamento delle leghe");
    } finally {
      setIsLoading(false);
    }

    return null;
  }, [searchParams]);

  const switchToLeague = useCallback(
    (leagueId: number) => {
      const league = leagues.find((l) => l.id === leagueId);
      if (league) {
        setSelectedLeagueId(leagueId);
        router.push(`/auctions?league=${leagueId}`);
        toast.success(`Passaggio alla lega: ${league.name}`);
      }
    },
    [leagues, router]
  );

  // Initialize leagues on mount
  useEffect(() => {
    fetchUserLeagues();
  }, [fetchUserLeagues]);

  // Handle league changes from URL
  useEffect(() => {
    const leagueParam = searchParams.get("league");
    if (leagueParam) {
      const leagueId = parseInt(leagueParam, 10);
      if (!isNaN(leagueId) && leagueId !== selectedLeagueId) {
        const leagueExists = leagues.some((l) => l.id === leagueId);
        if (leagueExists) {
          setSelectedLeagueId(leagueId);
        }
      }
    }
  }, [searchParams, selectedLeagueId, leagues]);

  return {
    leagues,
    selectedLeagueId,
    isLoading,
    fetchUserLeagues,
    switchToLeague,
    currentLeague: leagues.find((l) => l.id === selectedLeagueId) || null,
  };
}
