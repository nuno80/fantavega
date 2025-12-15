"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { PlayerFilterBar } from "@/components/players/PlayerFilterBar";
import { PlayerSearchBar } from "@/components/players/PlayerSearchBar";
import { PlayerSearchResults } from "@/components/players/PlayerSearchResults";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import { useInactivityRedirect } from "@/hooks/useInactivityRedirect";

// Dynamic import per lazy loading del modale
const QuickBidModal = dynamic(
  () =>
    import("@/components/players/QuickBidModal").then((mod) => mod.QuickBidModal),
  {
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
    ssr: false,
  }
);

// Player data structure based on your specification
export interface Player {
  id: number;
  role: string; // R column
  roleDetail: string; // RM column
  name: string; // Nome column
  team: string; // Squadra column
  qtA: number; // Qt.A column
  qtI: number; // Qt.I column
  diff: number; // Diff column
  qtAM: number; // Qt.A M column
  qtIM: number; // Qt.I M column
  diffM: number; // Diff.M column
  fvm: number; // FVM column
  fvmM: number; // FVM M column
  isStarter?: boolean; // Titolare (icona shield)
  isFavorite?: boolean; // Preferito (icona sports_soccer)
  integrityValue?: number; // Integrità (icona trending_up)
  hasFmv?: boolean; // FMV (icona timer)
  photo_url?: string | null;
}

export interface PlayerWithAuctionStatus extends Player {
  auctionStatus: "no_auction" | "active_auction" | "assigned";
  auctionId?: number;
  currentBid?: number;
  timeRemaining?: number; // in seconds
  isAssignedToUser?: boolean;
  assignedToTeam?: string;

  currentHighestBidderName?: string;
  cooldownInfo?: {
    timeRemaining: number;
    message: string;
  };
  autoBids?: Array<{
    userId: string;
    username: string;
    maxAmount: number;
    isActive: boolean;
  }>;
  userAutoBid?: {
    userId: string;
    username: string;
    maxAmount: number;
    isActive: boolean;
  } | null;
}

export interface SearchFilters {
  searchTerm: string;
  roles: string[];
  teams: string[];
  auctionStatus: string[];
  timeRemaining: string[];
  showAssigned: boolean;
  isStarter: boolean;
  isFavorite: boolean;
  hasIntegrity: boolean;
  hasFmv: boolean;
}

interface PlayerSearchInterfaceProps {
  userId: string;
  userRole: string;
}

export function PlayerSearchInterface({
  userId,
  userRole,
}: PlayerSearchInterfaceProps) {
  // Redirect to home after 30 seconds of inactivity
  useInactivityRedirect({ timeoutSeconds: 30 });

  const [players, setPlayers] = useState<PlayerWithAuctionStatus[]>([]);
  // filteredPlayers is no longer needed as players will contain only the filtered page
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedPlayer, setSelectedPlayer] =
    useState<PlayerWithAuctionStatus | null>(null);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const LIMIT = 20;

  const [filters, setFilters] = useState<SearchFilters>({
    searchTerm: "",
    roles: [],
    teams: [],
    auctionStatus: [],
    timeRemaining: [],
    showAssigned: true,
    isStarter: false,
    isFavorite: false,
    hasIntegrity: false,
    hasFmv: false,
  });

  // Debounce search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(filters.searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(filters.searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters.searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearchTerm,
    filters.roles,
    filters.teams,
    filters.auctionStatus,
    filters.showAssigned,
    filters.isStarter,
    filters.isFavorite,
    filters.hasIntegrity,
    filters.hasFmv
  ]);

  const { socket, isConnected } = useSocket();

  // Define refreshPlayersData first
  const refreshPlayersData = useCallback(
    async (leagueIdToLoad?: number) => {
      const leagueId = leagueIdToLoad || selectedLeagueId;
      if (!leagueId) return;

      try {
        setIsLoading(true);
        const queryParams = new URLSearchParams();
        queryParams.set("page", page.toString());
        queryParams.set("limit", LIMIT.toString());

        if (debouncedSearchTerm) queryParams.set("search", debouncedSearchTerm);
        if (filters.roles.length > 0) queryParams.set("roles", filters.roles.join(","));
        if (filters.teams.length > 0) queryParams.set("teams", filters.teams.join(","));
        if (filters.auctionStatus.length > 0) queryParams.set("auctionStatus", filters.auctionStatus.join(","));
        if (!filters.showAssigned) queryParams.set("showAssigned", "false");

        if (filters.isStarter) queryParams.set("isStarter", "true");
        if (filters.isFavorite) queryParams.set("isFavorite", "true");
        if (filters.hasIntegrity) queryParams.set("hasIntegrity", "true");
        if (filters.hasFmv) queryParams.set("hasFmv", "true");

        const playersResponse = await fetch(
          `/api/leagues/${leagueId}/players-with-status?${queryParams.toString()}`
        );

        if (playersResponse.ok) {
          const data = await playersResponse.json();
          setPlayers(data.players);
          setTotalPages(data.metadata.totalPages);
          setTotalPlayers(data.metadata.total);
        }
      } catch (error) {
        console.error("Error refreshing players data:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [
      selectedLeagueId,
      page,
      debouncedSearchTerm,
      filters.roles,
      filters.teams,
      filters.auctionStatus,
      filters.showAssigned,
      filters.isStarter,
      filters.isFavorite,
      filters.hasIntegrity,
      filters.hasFmv
    ]
  );

  // Fetch initial data
  useEffect(() => {
    const fetchPlayersData = async () => {
      try {
        setIsLoading(true);

        // Trigger compliance check on page access
        try {
          await fetch("/api/user/trigger-login-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          console.log("Compliance check triggered successfully");
        } catch (error) {
          console.warn("Failed to trigger compliance check:", error);
        }

        // Get user's leagues first
        const leaguesResponse = await fetch("/api/user/leagues");
        if (!leaguesResponse.ok) throw new Error("Failed to fetch leagues");

        const leagues = await leaguesResponse.json();

        if (leagues.length === 0) {
          // Se l'utente non ha leghe, carica solo i dati base dei giocatori
          // Nota: questo endpoint potrebbe non supportare la paginazione come l'altro,
          // ma per ora manteniamo il comportamento originale per utenti senza lega
          const playersResponse = await fetch(`/api/players`, {
            credentials: "include", // Include cookies per autenticazione Clerk
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (!playersResponse.ok) throw new Error("Failed to fetch players");

          const playersData = await playersResponse.json();
          // Adatta i dati al formato PlayerWithAuctionStatus
          const adaptedPlayers = playersData.players.map((p: Player) => ({
            ...p,
            auctionStatus: "no_auction" as const,
          }));

          setPlayers(adaptedPlayers);
          setTotalPlayers(adaptedPlayers.length);
          setTotalPages(1);

          toast.info(
            "Stai visualizzando i giocatori in modalità sola lettura perché non sei iscritto a nessuna lega"
          );
          return;
        }

        // Use first league for now (in real app, user might select)
        const league = leagues[0];
        setSelectedLeagueId(league.id);

        // Use the existing refresh function to load player data, passing the league ID directly
        // Note: refreshPlayersData depends on state which might not be updated yet in this closure
        // so we call it but it will use initial state values for filters/page
      } catch (error) {
        console.error("Error fetching players:", error);
        toast.error("Errore nel caricamento dei giocatori");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayersData();
  }, [userId]);

  // Trigger refresh when dependencies change
  useEffect(() => {
    if (selectedLeagueId) {
      refreshPlayersData();
    }
  }, [refreshPlayersData, selectedLeagueId]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    socket.emit("join-league-room", selectedLeagueId.toString());

    // Auto-process expired auctions every 30 seconds
    const processExpiredAuctions = async () => {
      try {
        const response = await fetch(
          `/api/leagues/${selectedLeagueId}/process-expired-auctions`,
          {
            method: "POST",
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.processedCount > 0) {
            console.log(`Processed ${result.processedCount} expired auctions`);
            // Refresh players data
            refreshPlayersData();
          }
        }
      } catch (error) {
        console.error("Error processing expired auctions:", error);
      }
    };

    // Process expired auctions immediately and then every 30 seconds
    processExpiredAuctions();
    const expiredAuctionsInterval = setInterval(processExpiredAuctions, 30000);

    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      highestBidderName?: string;
      scheduledEndTime: number;
      autoBids?: Array<{
        userId: string;
        username: string;
        maxAmount: number;
        isActive: boolean;
      }>;
    }) => {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === data.playerId
            ? {
              ...player,
              auctionStatus: "active_auction", // <-- CORREZIONE: Assicura che lo stato sia sempre attivo su un update
              currentBid: data.newPrice,
              currentHighestBidderName:
                data.highestBidderName || data.highestBidderId,
              timeRemaining: Math.max(
                0,
                data.scheduledEndTime - Math.floor(Date.now() / 1000)
              ),
              autoBids: data.autoBids || player.autoBids,
              userAutoBid:
                data.autoBids?.find((ab) => ab.userId === userId) ||
                player.userAutoBid,
            }
            : player
        )
      );
    };

    const handleAuctionClosed = (data: {
      playerId: number;
      winnerId: string;
      finalPrice: number;
    }) => {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === data.playerId
            ? {
              ...player,
              auctionStatus: "assigned",
              assignedToTeam: data.winnerId,
              currentBid: data.finalPrice,
              timeRemaining: 0,
            }
            : player
        )
      );
    };

    const handleAuctionCreated = (data: {
      playerId: number;
      auctionId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === data.playerId
            ? {
              ...player,
              auctionStatus: "active_auction",
              auctionId: data.auctionId,
              currentBid: data.newPrice,
              timeRemaining: Math.max(
                0,
                data.scheduledEndTime - Math.floor(Date.now() / 1000)
              ),
            }
            : player
        )
      );
    };

    // Register event listeners - Only handle auction closures, not creation/updates
    // AuctionPageContent handles auction-created and auction-update events centrally
    socket.on("auction-closed-notification", handleAuctionClosed);

    return () => {
      socket.emit("leave-league-room", selectedLeagueId.toString());
      socket.off("auction-closed-notification", handleAuctionClosed);
      clearInterval(expiredAuctionsInterval);
    };
  }, [socket, isConnected, selectedLeagueId, refreshPlayersData, userId]);

  const handleBidOnPlayer = (player: PlayerWithAuctionStatus) => {
    setSelectedPlayer(player);
    setIsBidModalOpen(true);
  };

  const handleStartAuction = (player: PlayerWithAuctionStatus) => {
    // TODO: Implement start auction logic
    console.log("Start auction for player:", player);
  };

  const handleTogglePlayerIcon = async (
    playerId: number,
    iconType: "isStarter" | "isFavorite" | "integrityValue" | "hasFmv",
    value: boolean | number
  ) => {
    try {
      if (!selectedLeagueId) return;

      // Usa il nuovo endpoint per le preferenze
      const response = await fetch(
        `/api/leagues/${selectedLeagueId}/players/${playerId}/preferences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            iconType,
            value,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || error.message || "Errore nell'aggiornare la preferenza"
        );
      }

      // Aggiorna lo stato locale del giocatore
      setPlayers((prev) =>
        prev.map((player) =>
          player.id === playerId
            ? {
              ...player,
              [iconType]: value,
            }
            : player
        )
      );

      // Toast rimosso - l'icona cambia colore visivamente
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore nell'aggiornare la preferenza"
      );
    }
  };

  return (
    <div className="container space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Cerca Giocatori</h1>
        <div className="text-sm text-muted-foreground">
          {totalPlayers} giocatori trovati
        </div>
      </div>

      <PlayerSearchBar
        searchTerm={filters.searchTerm}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, searchTerm: term }))
        }
      />

      <PlayerFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        availableTeams={Array.from(new Set(players.map((p) => p.team))).sort()}
      />

      {isLoading ? (
        <div className="py-12 text-center">Caricamento giocatori...</div>
      ) : (
        <>
          <PlayerSearchResults
            players={players}
            onBidOnPlayer={handleBidOnPlayer}
            onStartAuction={handleStartAuction}
            onTogglePlayerIcon={handleTogglePlayerIcon}
            userRole={userRole}
            userId={userId}
            leagueId={selectedLeagueId || undefined}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center space-x-4 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Precedente
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {page} di {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Successivo
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {selectedPlayer && (
        <QuickBidModal
          isOpen={isBidModalOpen}
          onClose={() => setIsBidModalOpen(false)}
          player={selectedPlayer}
          leagueId={selectedLeagueId!}
          userId={userId}
          onBidSuccess={() => refreshPlayersData()}
        />
      )}
    </div>
  );
}
