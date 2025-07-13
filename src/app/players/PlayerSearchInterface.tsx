"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PlayerSearchBar } from "@/components/players/PlayerSearchBar";
import { PlayerAdvancedFilters } from "@/components/players/PlayerAdvancedFilters";
import { PlayerSearchResults } from "@/components/players/PlayerSearchResults";
import { QuickBidModal } from "@/components/players/QuickBidModal";
import { useSocket } from "@/contexts/SocketContext";

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
}

export interface PlayerWithAuctionStatus extends Player {
  auctionStatus: "no_auction" | "active_auction" | "assigned";
  auctionId?: number;
  currentBid?: number;
  timeRemaining?: number; // in seconds
  isAssignedToUser?: boolean;
  assignedToTeam?: string;
  canStartAuction?: boolean;
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

export function PlayerSearchInterface({ userId, userRole }: PlayerSearchInterfaceProps) {
  const [players, setPlayers] = useState<PlayerWithAuctionStatus[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithAuctionStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithAuctionStatus | null>(null);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  
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
    hasFmv: false
  });

  const { socket, isConnected } = useSocket();

  // Fetch initial data
  useEffect(() => {
    const fetchPlayersData = async () => {
      try {
        setIsLoading(true);
        
        // Get user's leagues first
        const leaguesResponse = await fetch("/api/user/leagues");
        if (!leaguesResponse.ok) throw new Error("Failed to fetch leagues");
        
        const leagues = await leaguesResponse.json();
        
        if (leagues.length === 0) {
          // Se l'utente non ha leghe, carica solo i dati base dei giocatori
          const playersResponse = await fetch(`/api/players`, {
            credentials: 'include', // Include cookies per autenticazione Clerk
            headers: {
              'Content-Type': 'application/json',
            }
          });
          if (!playersResponse.ok) throw new Error("Failed to fetch players");
          
          const playersData = await playersResponse.json();
          // Adatta i dati al formato PlayerWithAuctionStatus
          const adaptedPlayers = playersData.players.map((p: Player) => ({
            ...p,
            auctionStatus: "no_auction" as const,
          }));
          
          setPlayers(adaptedPlayers);
          setFilteredPlayers(adaptedPlayers);
          toast.info("Stai visualizzando i giocatori in modalità sola lettura perché non sei iscritto a nessuna lega");
          return;
        }

        // Use first league for now (in real app, user might select)
        const league = leagues[0];
        setSelectedLeagueId(league.id);

        // Fetch players with auction status for this league
        const playersResponse = await fetch(`/api/leagues/${league.id}/players-with-status`);
        if (!playersResponse.ok) throw new Error("Failed to fetch players");
        
        const playersData = await playersResponse.json();
        console.log("Players data loaded:", playersData.slice(0, 3)); // Debug: mostra i primi 3 giocatori
        console.log("Active auctions found:", playersData.filter((p: any) => p.auctionStatus === 'active_auction').length);
        setPlayers(playersData);
        setFilteredPlayers(playersData);

      } catch (error) {
        console.error("Error fetching players:", error);
        toast.error("Errore nel caricamento dei giocatori");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlayersData();
  }, [userId]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    socket.emit("join-league-room", selectedLeagueId.toString());

    // Auto-process expired auctions every 30 seconds
    const processExpiredAuctions = async () => {
      try {
        const response = await fetch(`/api/leagues/${selectedLeagueId}/process-expired-auctions`, {
          method: "POST",
        });
        
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
      setPlayers(prev => prev.map(player => 
        player.id === data.playerId 
          ? { 
              ...player, 
              currentBid: data.newPrice,
              currentHighestBidderName: data.highestBidderName || data.highestBidderId,
              timeRemaining: Math.max(0, data.scheduledEndTime - Math.floor(Date.now() / 1000)),
              autoBids: data.autoBids || player.autoBids,
              userAutoBid: data.autoBids?.find(ab => ab.userId === userId) || player.userAutoBid
            }
          : player
      ));
    };

    const handleAuctionClosed = (data: {
      playerId: number;
      winnerId: string;
      finalPrice: number;
    }) => {
      setPlayers(prev => prev.map(player => 
        player.id === data.playerId 
          ? { 
              ...player, 
              auctionStatus: "assigned",
              assignedToTeam: data.winnerId,
              currentBid: data.finalPrice,
              timeRemaining: 0
            }
          : player
      ));
    };

    socket.on("auction-update", handleAuctionUpdate);
    socket.on("auction-closed-notification", handleAuctionClosed);

    return () => {
      socket.emit("leave-league-room", selectedLeagueId.toString());
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("auction-closed-notification", handleAuctionClosed);
      clearInterval(expiredAuctionsInterval);
    };
  }, [socket, isConnected, selectedLeagueId]);

  // Filter players based on current filters
  useEffect(() => {
    let filtered = [...players];

    // Search term filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(player =>
        player.name.toLowerCase().includes(term) ||
        player.team.toLowerCase().includes(term)
      );
    }

    // Role filter
    if (filters.roles.length > 0) {
      filtered = filtered.filter(player => filters.roles.includes(player.role));
    }

    // Team filter
    if (filters.teams.length > 0) {
      filtered = filtered.filter(player => filters.teams.includes(player.team));
    }

    // Auction status filter
    if (filters.auctionStatus.length > 0) {
      filtered = filtered.filter(player => filters.auctionStatus.includes(player.auctionStatus));
    }

    // Time remaining filter
    if (filters.timeRemaining.length > 0) {
      filtered = filtered.filter(player => {
        if (!player.timeRemaining) return filters.timeRemaining.includes("no_auction");
        
        const hours = player.timeRemaining / 3600;
        return filters.timeRemaining.some(range => {
          switch (range) {
            case "less_1h": return hours < 1;
            case "1_6h": return hours >= 1 && hours <= 6;
            case "6_24h": return hours > 6 && hours <= 24;
            case "more_24h": return hours > 24;
            default: return false;
          }
        });
      });
    }

    // Show/hide assigned players
    if (!filters.showAssigned) {
      filtered = filtered.filter(player => player.auctionStatus !== "assigned");
    }

    // Player characteristics filters
    if (filters.isStarter) {
      filtered = filtered.filter(player => player.isStarter);
    }

    if (filters.isFavorite) {
      filtered = filtered.filter(player => player.isFavorite);
    }

    if (filters.hasIntegrity) {
      filtered = filtered.filter(player => player.integrityValue && player.integrityValue > 0);
    }

    if (filters.hasFmv) {
      filtered = filtered.filter(player => player.hasFmv);
    }

    setFilteredPlayers(filtered);
  }, [players, filters]);

  const handleBidOnPlayer = (player: PlayerWithAuctionStatus) => {
    setSelectedPlayer(player);
    setIsBidModalOpen(true);
  };

  const refreshPlayersData = async () => {
    if (!selectedLeagueId) return;
    
    try {
      const playersResponse = await fetch(`/api/leagues/${selectedLeagueId}/players-with-status`);
      if (playersResponse.ok) {
        const playersData = await playersResponse.json();
        setPlayers(playersData);
        setFilteredPlayers(playersData);
      }
    } catch (error) {
      console.error("Error refreshing players data:", error);
    }
  };

  const handleStartAuction = async (playerId: number) => {
    if (!selectedLeagueId) return;

    try {
      const response = await fetch(`/api/leagues/${selectedLeagueId}/start-auction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || "Errore nell'avviare l'asta");
      }

      toast.success("Asta avviata con successo!");
      
      // Refresh players data
      const playersResponse = await fetch(`/api/leagues/${selectedLeagueId}/players-with-status`);
      if (playersResponse.ok) {
        const playersData = await playersResponse.json();
        setPlayers(playersData);
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nell'avviare l'asta");
    }
  };

  const handleTogglePlayerIcon = async (playerId: number, iconType: 'isStarter' | 'isFavorite' | 'integrityValue' | 'hasFmv', value: boolean | number) => {
    try {
      if (!selectedLeagueId) return;

      const response = await fetch(`/api/players/${playerId}/toggle-icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iconType,
          value,
          leagueId: selectedLeagueId
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || "Errore nell'aggiornare l'icona");
      }

      // Aggiorna lo stato locale del giocatore
      setPlayers(prev => prev.map(player =>
        player.id === playerId
          ? {
              ...player,
              [iconType]: value
            }
          : player
      ));

      toast.success("Preferenza salvata con successo!");
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nell'aggiornare l'icona");
    }
  };

  if (isLoading) {
    return <div>Caricamento giocatori...</div>;
  }

  return (
    <div className="container px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Cerca Giocatori</h1>
        <div className="text-sm text-muted-foreground">
          {filteredPlayers.length} di {players.length} giocatori
        </div>
      </div>

      <PlayerSearchBar
        searchTerm={filters.searchTerm}
        onSearchChange={(term) => setFilters(prev => ({ ...prev, searchTerm: term }))}
      />

      <PlayerAdvancedFilters
        filters={filters}
        onFiltersChange={setFilters}
        availableTeams={Array.from(new Set(players.map(p => p.team))).sort()}
      />

      <PlayerSearchResults
        players={filteredPlayers}
        onBidOnPlayer={handleBidOnPlayer}
        onStartAuction={handleStartAuction}
        onTogglePlayerIcon={handleTogglePlayerIcon}
        userRole={userRole}
        userId={userId}
      />

      {selectedPlayer && (
        <QuickBidModal
          isOpen={isBidModalOpen}
          onClose={() => setIsBidModalOpen(false)}
          player={selectedPlayer}
          leagueId={selectedLeagueId!}
          userId={userId}
          onBidSuccess={refreshPlayersData}
        />
      )}
    </div>
  );
}