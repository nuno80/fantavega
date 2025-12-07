import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

const LAST_LEAGUE_KEY = "fantavega_last_league_id";

interface League {
  id: number;
  name: string;
  status: string;
  min_bid: number;
  team_name?: string;
  current_budget: number;
  locked_credits: number;
}

// Helper per leggere da localStorage in modo sicuro
function getStoredLeagueId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LAST_LEAGUE_KEY);
    return stored ? parseInt(stored, 10) : null;
  } catch {
    return null;
  }
}

// Helper per salvare in localStorage
function saveLeagueId(leagueId: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, String(leagueId));
  } catch {
    // Ignora errori localStorage (es. modalità privata)
  }
}

export function useLeague() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Flag per evitare redirect durante l'idratazione iniziale
  const isInitialMountRef = useRef(true);

  // Inizializzazione sincrona: priorità URL > localStorage > null
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      // Prima controlla URL
      const param = searchParams.get("league");
      if (param) {
        const urlLeagueId = parseInt(param, 10);
        if (!isNaN(urlLeagueId)) {
          return urlLeagueId;
        }
      }
      // Poi controlla localStorage
      return getStoredLeagueId();
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(true);

  const fetchUserLeagues = useCallback(async () => {
    try {
      const response = await fetch("/api/user/leagues");
      if (response.ok) {
        const leagueData = await response.json();
        setLeagues(leagueData);

        // Se abbiamo già un selectedLeagueId (da URL o localStorage), verifichiamolo
        if (selectedLeagueId) {
          const leagueExists = leagueData.some(
            (l: League) => l.id === selectedLeagueId
          );
          if (leagueExists) {
            // La lega selezionata è valida, mantienila
            setIsLoading(false);
            return selectedLeagueId;
          }
        }

        // Controlla URL param
        const leagueParam = searchParams.get("league");
        if (leagueParam) {
          const paramLeagueId = parseInt(leagueParam, 10);
          const foundLeague = leagueData.find(
            (l: League) => l.id === paramLeagueId
          );
          if (foundLeague) {
            setSelectedLeagueId(foundLeague.id);
            saveLeagueId(foundLeague.id);
            return foundLeague.id;
          }
        }

        // Default alla prima lega se nessuna selezione valida
        if (leagueData.length > 0) {
          setSelectedLeagueId(leagueData[0].id);
          saveLeagueId(leagueData[0].id);
          return leagueData[0].id;
        }
      }
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      toast.error("Errore nel caricamento delle leghe");
    } finally {
      setIsLoading(false);
      isInitialMountRef.current = false;
    }

    return null;
  }, [searchParams, selectedLeagueId]);

  const switchToLeague = useCallback(
    (leagueId: number, skipNavigation = false) => {
      const league = leagues.find((l) => l.id === leagueId);
      if (league) {
        setSelectedLeagueId(leagueId);
        saveLeagueId(leagueId);

        // Skip navigation durante l'idratazione iniziale per evitare flicker
        if (!skipNavigation && !isInitialMountRef.current) {
          router.push(`/auctions?league=${leagueId}`);
          toast.success(`Passaggio alla lega: ${league.name}`);
        }
      } else if (leagueId && !isInitialMountRef.current) {
        // Se la lega non è ancora caricata ma abbiamo un ID,
        // aggiorna lo stato senza navigare
        setSelectedLeagueId(leagueId);
        saveLeagueId(leagueId);
      }
    },
    [leagues, router]
  );

  // Initialize leagues on mount
  useEffect(() => {
    fetchUserLeagues();
  }, [fetchUserLeagues]);

  // Handle league changes from URL (solo dopo l'idratazione iniziale)
  useEffect(() => {
    // Skip durante il mount iniziale
    if (isInitialMountRef.current) return;

    const leagueParam = searchParams.get("league");
    if (leagueParam) {
      const leagueId = parseInt(leagueParam, 10);
      if (!isNaN(leagueId) && leagueId !== selectedLeagueId) {
        const leagueExists = leagues.some((l) => l.id === leagueId);
        if (leagueExists) {
          setSelectedLeagueId(leagueId);
          saveLeagueId(leagueId);
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
