"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Dumbbell,
  Gavel,
  Heart,
  Search,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { QuickBidModal } from "@/components/players/QuickBidModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSocket } from "@/contexts/SocketContext";

import { StandardBidModal } from "./StandardBidModal";

// Extend the Player interface to match PlayerWithAuctionStatus
interface Player {
  id: number;
  role: string;
  roleDetail: string;
  name: string;
  team: string;
  qtA: number;
  qtI: number;
  diff: number;
  qtAM: number;
  qtIM: number;
  diffM: number;
  fvm: number;
  fvmM: number;
}

interface PlayerWithStatus extends Player {
  auctionStatus: "no_auction" | "active_auction" | "assigned";
  auctionId?: number;
  currentBid?: number;
  currentHighestBidderName?: string;
  timeRemaining?: number;
  status?: string;
  // User preferences
  isStarter?: boolean;
  isFavorite?: boolean;
  integrityValue?: number;
  hasFmv?: boolean;
}

interface CallPlayerInterfaceProps {
  leagueId: number;
  userId: string;
  onStartAuction?: (playerId: number) => void;
}

interface ApiPlayer {
  id: number;
  role: string;
  role_mantra?: string;
  name: string;
  team: string;
  current_quotation?: number;
  initial_quotation?: number;
  current_quotation_mantra?: number;
  initial_quotation_mantra?: number;
  fvm?: number;
  fvm_mantra?: number;
  auction_status?: "no_auction" | "active_auction" | "assigned";
  current_bid?: number;
}

export function CallPlayerInterface({
  leagueId,
  userId,
  onStartAuction,
}: CallPlayerInterfaceProps) {
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithStatus[]>(
    []
  );
  const [selectedPlayerDetails, setSelectedPlayerDetails] =
    useState<PlayerWithStatus | null>(null);
  const [_isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedPlayerForBid, setSelectedPlayerForBid] =
    useState<PlayerWithStatus | null>(null);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [selectedPlayerForStartAuction, setSelectedPlayerForStartAuction] =
    useState<{
      id: number;
      name: string;
      role: string;
      team: string;
      qtA: number;
    } | null>(null);
  const [isStartAuctionModalOpen, setIsStartAuctionModalOpen] = useState(false);

  // Preference filters state
  const [preferenceFilters, setPreferenceFilters] = useState({
    isStarter: false,
    isFavorite: false,
    hasIntegrity: false,
    hasFmv: false,
  });

  // State for active tab
  const [activeTab, setActiveTab] = useState<"chiama" | "stats" | "filtri">(
    "chiama"
  );

  // Socket.IO connection
  const { socket, isConnected } = useSocket();

  // Fetch players data
  const refreshPlayersData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/players?limit=1000&leagueId=${leagueId}`
      );
      if (response.ok) {
        const data = await response.json();
        // Transform API data to match our interface
        const playersWithStatus = (data.players || []).map(
          (player: ApiPlayer) => ({
            id: player.id,
            role: player.role,
            roleDetail: player.role_mantra || "",
            name: player.name,
            team: player.team,
            qtA: player.current_quotation || 0,
            qtI: player.initial_quotation || 0,
            diff:
              (player.current_quotation || 0) - (player.initial_quotation || 0),
            qtAM: player.current_quotation_mantra || 0,
            qtIM: player.initial_quotation_mantra || 0,
            diffM:
              (player.current_quotation_mantra || 0) -
              (player.initial_quotation_mantra || 0),
            fvm: player.fvm || 0,
            fvmM: player.fvm_mantra || 0,
            // Auction status is now fetched from the API
            auctionStatus: player.auction_status || ("no_auction" as const),
            // Map current_bid from API to currentBid in our interface
            currentBid: player.current_bid,
            // Default preferences - these would come from user preferences API
            isStarter: false,
            isFavorite: false,
            integrityValue: 0,
            hasFmv: !!(player.fvm && player.fvm > 0),
          })
        );
        setPlayers(playersWithStatus);
      } else {
        console.error("Failed to fetch players:", response.status);
        toast.error("Errore nel caricamento dei giocatori");
      }
    } catch (error) {
      console.error("Error fetching players:", error);
      toast.error("Errore nel caricamento dei giocatori");
    } finally {
      setIsLoading(false);
    }
  }, [leagueId]);

  // Initial data fetch
  useEffect(() => {
    refreshPlayersData();
  }, [refreshPlayersData]);

  // Filter players based on search term, role, and preferences
  useEffect(() => {
    let filtered = players;

    // Filter by search term
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (player) =>
          player.name.toLowerCase().includes(searchLower) ||
          player.team.toLowerCase().includes(searchLower)
      );
    }

    // Filter by role
    if (selectedRole !== "ALL") {
      filtered = filtered.filter((player) => player.role === selectedRole);
    }

    // Filter by preferences
    if (preferenceFilters.isStarter) {
      filtered = filtered.filter((player) => player.isStarter);
    }
    if (preferenceFilters.isFavorite) {
      filtered = filtered.filter((player) => player.isFavorite);
    }
    if (preferenceFilters.hasIntegrity) {
      filtered = filtered.filter(
        (player) => player.integrityValue && player.integrityValue > 0
      );
    }
    if (preferenceFilters.hasFmv) {
      filtered = filtered.filter((player) => player.hasFmv);
    }

    setFilteredPlayers(filtered);
  }, [players, searchTerm, selectedRole, preferenceFilters]);

  // Socket.IO real-time updates - CENTRALIZED IN AuctionPageContent
  useEffect(() => {
    if (!isConnected || !socket || !leagueId) return;

    // NOTE: According to project specifications, all auction-related Socket.IO event listeners
    // must be centralized in AuctionPageContent.tsx. This component only handles auction-closed
    // events for updating local player state when auctions end.

    console.log(
      `[CallPlayerInterface] Registering minimal Socket.IO listeners for league ${leagueId}`
    );

    // Handle auction closed events only (AuctionPageContent handles creation and updates)
    // Handle auction closed events
    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      console.log("[CallPlayerInterface] Auction closed:", data);
      setPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player.id === data.playerId
            ? {
              ...player,
              auctionStatus: "assigned" as const,
              currentBid: data.finalPrice,
              currentHighestBidderName: data.winnerId,
              timeRemaining: 0,
            }
            : player
        )
      );
    };

    // Handle auction created events to update player status immediately
    const handleAuctionCreated = (data: {
      playerId: number;
      auctionId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      console.log("[CallPlayerInterface] Auction created:", data);
      setPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player.id === data.playerId
            ? {
              ...player,
              auctionStatus: "active_auction" as const,
              auctionId: data.auctionId,
              currentBid: data.newPrice,
              currentHighestBidderName: data.highestBidderId,
              timeRemaining: Math.max(
                0,
                data.scheduledEndTime - Math.floor(Date.now() / 1000)
              ),
            }
            : player
        )
      );

      // Force refresh from API to ensure consistency
      refreshPlayersData();
    };

    // Register events
    socket.on("auction-closed-notification", handleAuctionClosed);
    socket.on("auction-created", handleAuctionCreated);

    // Cleanup on unmount
    return () => {
      socket.off("auction-closed-notification", handleAuctionClosed);
      socket.off("auction-created", handleAuctionCreated);
    };
  }, [socket, isConnected, leagueId]);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (value.trim()) {
      setIsDropdownOpen(true);
    } else {
      setIsDropdownOpen(false);
    }
  };

  // Handle player selection
  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayer(playerId);
    setIsDropdownOpen(false);

    const player = filteredPlayers.find((p) => p.id.toString() === playerId);
    setSelectedPlayerDetails(player || null);
  };

  // Handle bid on player (for active auctions)
  const handleBidOnPlayer = (player: PlayerWithStatus) => {
    setSelectedPlayerForBid(player);
    setIsBidModalOpen(true);
  };

  // Handle start auction
  const handleMainAction = () => {
    if (!selectedPlayerDetails) return;

    // DEBUG: Log action decision
    console.log("[DEBUG MAIN ACTION] Player details:", {
      id: selectedPlayerDetails.id,
      name: selectedPlayerDetails.name,
      auctionStatus: selectedPlayerDetails.auctionStatus,
      currentBid: selectedPlayerDetails.currentBid,
      currentHighestBidderName: selectedPlayerDetails.currentHighestBidderName,
    });

    if (selectedPlayerDetails.auctionStatus === "active_auction") {
      console.log("[DEBUG MAIN ACTION] Handling bid on existing auction");
      handleBidOnPlayer(selectedPlayerDetails);
    } else {
      console.log("[DEBUG MAIN ACTION] Starting new auction");
      handleStartAuction();
    }
  };

  const handleStartAuction = () => {
    if (!selectedPlayerDetails) return;

    // DEBUG: Log current player status before starting auction
    console.log("[DEBUG START AUCTION] Player details:", {
      id: selectedPlayerDetails.id,
      name: selectedPlayerDetails.name,
      auctionStatus: selectedPlayerDetails.auctionStatus,
      currentBid: selectedPlayerDetails.currentBid,
      currentHighestBidderName: selectedPlayerDetails.currentHighestBidderName,
      qtA: selectedPlayerDetails.qtA,
    });

    // Check if player already has an active auction
    if (selectedPlayerDetails.auctionStatus === "active_auction") {
      console.warn(
        "[DEBUG START AUCTION] Player already has an active auction!"
      );
      toast.error("Un'asta per questo giocatore è già in corso");
      return;
    }

    // Check if player is already assigned
    if (selectedPlayerDetails.auctionStatus === "assigned") {
      console.warn("[DEBUG START AUCTION] Player is already assigned!");
      toast.error("Questo giocatore è già stato assegnato");
      return;
    }

    // Proceed with auction start immediately without blocking refresh
    // Backend will handle validation if auction already exists
    setSelectedPlayerForStartAuction({
      id: selectedPlayerDetails.id,
      name: selectedPlayerDetails.name,
      team: selectedPlayerDetails.team,
      role: selectedPlayerDetails.role,
      qtA: selectedPlayerDetails.qtA,
    });
    setIsStartAuctionModalOpen(true);
  };

  // Handle successful auction start
  const handleAuctionStartSuccess = async (
    amount: number,
    bidType: "manual" | "quick" = "manual",
    maxAmount?: number
  ) => {
    if (!selectedPlayerForStartAuction) return;

    try {
      const requestBody = {
        amount: amount,
        bid_type: bidType,
        max_amount: maxAmount, // Corretto: usa 'max_amount' come si aspetta l'API
      };

      // DEBUG: Log detailed information about the auction attempt
      console.log("[DEBUG AUCTION START] Attempting to start auction:", {
        playerId: selectedPlayerForStartAuction.id,
        playerName: selectedPlayerForStartAuction.name,
        amount: amount,
        bidType: bidType,
        maxAmount: maxAmount,
        requestBody: requestBody,
      });

      console.log("[DEBUG FRONT-END] Sending request body:", requestBody);
      console.log("[DEBUG FRONT-END] maxAmount value:", maxAmount);
      console.log("[DEBUG FRONT-END] maxAmount type:", typeof maxAmount);

      const response = await fetch(
        `/api/leagues/${leagueId}/players/${selectedPlayerForStartAuction.id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json();

        // Parse the error message to provide specific user feedback
        const errorMessage =
          error.message || error.error || "Errore nel creare l'asta";

        // Check for specific error conditions and provide appropriate messages
        if (errorMessage.includes("superiore all'offerta attuale")) {
          // Extract the current bid amount from the error message
          const bidMatch = errorMessage.match(/(\d+)\s*crediti/);
          const currentBid = bidMatch ? parseInt(bidMatch[1]) : null;

          if (currentBid !== null) {
            throw new Error(
              `Devi offrire almeno ${currentBid + 1} crediti per avviare l'asta`
            );
          } else {
            throw new Error(
              "Devi offrire almeno il valore QtA del giocatore per avviare l'asta"
            );
          }
        } else if (
          errorMessage.includes("già il miglior offerente") ||
          errorMessage.includes("stesso utente")
        ) {
          throw new Error("Sei già il miglior offerente per questo giocatore");
        } else if (
          errorMessage.includes("budget") ||
          errorMessage.includes("crediti insufficienti")
        ) {
          throw new Error("Budget insufficiente per questa offerta");
        } else if (
          errorMessage.includes("asta già") ||
          errorMessage.includes("auction already")
        ) {
          throw new Error("Un'asta per questo giocatore è già in corso");
        } else {
          // Use the original error message for other cases
          throw new Error(errorMessage);
        }
      }

      toast.success("Asta avviata con successo!");

      // Reset selection after starting auction
      setSelectedPlayer("");
      setSelectedPlayerDetails(null);
      setSelectedPlayerForStartAuction(null);

      // Socket.IO will handle the real-time update, no need to refresh manually
      console.log(
        "[CallPlayerInterface] Auction created successfully, waiting for Socket.IO update"
      );

      // Callback to parent
      if (onStartAuction) {
        onStartAuction(selectedPlayerForStartAuction.id);
      }
    } catch (error) {
      console.error("Failed to start auction:", error);
      // Rilancia l'errore per permettere al modal di gestirlo (mostrare il toast)
      throw error;
    }
  };

  const roleButtons = [
    { key: "ALL", label: "TUTTI", color: "bg-red-600" },
    { key: "P", label: "P", color: "bg-gray-700" },
    { key: "D", label: "D", color: "bg-gray-700" },
    { key: "C", label: "C", color: "bg-gray-700" },
    { key: "A", label: "A", color: "bg-gray-700" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("chiama")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "chiama"
            ? "border-primary bg-muted text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
        >
          <Gavel className="h-4 w-4" />
          CHIAMA
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "stats"
            ? "border-primary bg-muted text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
        >
          <TrendingUp className="h-4 w-4" />
          STATS
        </button>
        <button
          onClick={() => setActiveTab("filtri")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "filtri"
            ? "border-primary bg-muted text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
        >
          <Search className="h-4 w-4" />
          FILTRI
        </button>

        {/* Results counter and active filters indicator in tab bar */}
        <div className="ml-auto flex items-center gap-3 px-4 py-3">
          {/* Active filters indicator */}
          {(() => {
            const activeFiltersCount =
              (selectedRole !== "ALL" ? 1 : 0) +
              (preferenceFilters.isStarter ? 1 : 0) +
              (preferenceFilters.isFavorite ? 1 : 0) +
              (preferenceFilters.hasIntegrity ? 1 : 0) +
              (preferenceFilters.hasFmv ? 1 : 0);

            return activeFiltersCount > 0 ? (
              <div className="flex items-center gap-1 text-xs">
                <Badge variant="secondary" className="text-xs">
                  {activeFiltersCount} filtri attivi
                </Badge>
              </div>
            ) : null;
          })()}

          <div className="text-xs text-gray-400">
            {filteredPlayers.length} trovati
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "chiama" && (
          <div className="flex flex-col items-center gap-3 md:flex-row">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Cerca giocatore o squadra..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchTerm.trim() && setIsDropdownOpen(true)}
                className={`h-10 border-input bg-background pl-10 text-foreground placeholder-muted-foreground ${(() => {
                  const activeFiltersCount =
                    (selectedRole !== "ALL" ? 1 : 0) +
                    (preferenceFilters.isStarter ? 1 : 0) +
                    (preferenceFilters.isFavorite ? 1 : 0) +
                    (preferenceFilters.hasIntegrity ? 1 : 0) +
                    (preferenceFilters.hasFmv ? 1 : 0);
                  return activeFiltersCount > 0
                    ? "border-blue-500 bg-blue-50/10"
                    : "";
                })()}`}
                title={(() => {
                  const activeFilters = [];
                  if (selectedRole !== "ALL")
                    activeFilters.push(`Ruolo: ${selectedRole}`);
                  if (preferenceFilters.isStarter)
                    activeFilters.push("Titolari");
                  if (preferenceFilters.isFavorite)
                    activeFilters.push("Preferiti");
                  if (preferenceFilters.hasIntegrity)
                    activeFilters.push("Integrità");
                  if (preferenceFilters.hasFmv) activeFilters.push("FMV");
                  return activeFilters.length > 0
                    ? `Filtri attivi: ${activeFilters.join(", ")}`
                    : "Cerca giocatore o squadra...";
                })()}
              />

              {/* Active filters indicator in search bar */}
              {(() => {
                const activeFiltersCount =
                  (selectedRole !== "ALL" ? 1 : 0) +
                  (preferenceFilters.isStarter ? 1 : 0) +
                  (preferenceFilters.isFavorite ? 1 : 0) +
                  (preferenceFilters.hasIntegrity ? 1 : 0) +
                  (preferenceFilters.hasFmv ? 1 : 0);

                return activeFiltersCount > 0 ? (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Badge
                      variant="secondary"
                      className="bg-blue-500 text-xs text-white"
                    >
                      {activeFiltersCount}
                    </Badge>
                  </div>
                ) : null;
              })()}

              {/* Auto-dropdown */}
              {isDropdownOpen && filteredPlayers.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-card shadow-lg">
                  {filteredPlayers.slice(0, 10).map((player) => (
                    <div
                      key={player.id}
                      className="cursor-pointer border-b border-border px-3 py-2 text-foreground last:border-b-0 hover:bg-muted"
                      onClick={() => handlePlayerSelect(player.id.toString())}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{player.name}</span>
                          <span className="ml-2 text-gray-400">
                            ({player.role}) - {player.team}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {player.auctionStatus === "active_auction" && (
                            <Badge variant="destructive" className="text-xs">
                              ASTA
                            </Badge>
                          )}
                          {player.auctionStatus === "assigned" && (
                            <Badge variant="secondary" className="text-xs">
                              ASSEGNATO
                            </Badge>
                          )}
                          {player.auctionStatus === "no_auction" && (
                            <Badge
                              variant="outline"
                              className="border-green-400 text-xs text-green-400"
                            >
                              DISPONIBILE
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredPlayers.length > 10 && (
                    <div className="border-t border-gray-600 px-3 py-2 text-center text-sm text-gray-400">
                      ... e altri {filteredPlayers.length - 10} giocatori
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Player Selection */}
            <Select value={selectedPlayer} onValueChange={handlePlayerSelect}>
              <SelectTrigger className="h-10 w-64 border-input bg-background text-foreground">
                <SelectValue placeholder="Seleziona Giocatore" />
              </SelectTrigger>
              <SelectContent className="max-h-60 border-border bg-card">
                {filteredPlayers.slice(0, 50).map((player) => (
                  <SelectItem
                    key={player.id}
                    value={player.id.toString()}
                    className="text-foreground hover:bg-muted"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span>
                        {player.name} ({player.role}) - {player.team}
                      </span>
                      {player.auctionStatus === "active_auction" && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          ASTA
                        </Badge>
                      )}
                      {player.auctionStatus === "assigned" && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          ASSEGNATO
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
                {filteredPlayers.length > 50 && (
                  <div className="px-2 py-2 text-center text-xs text-muted-foreground">
                    ... altri {filteredPlayers.length - 50} risultati. Affina la ricerca.
                  </div>
                )}
              </SelectContent>
            </Select>

            {/* Action Button */}
            <Button
              size="sm"
              className="h-10 bg-blue-500 px-6 text-white hover:bg-blue-600"
              onClick={handleMainAction}
              disabled={
                !selectedPlayer ||
                (selectedPlayerDetails?.auctionStatus !== "no_auction" &&
                  selectedPlayerDetails?.auctionStatus !== "active_auction")
              }
              title={
                selectedPlayerDetails?.auctionStatus === "active_auction"
                  ? "Fai un Rilancio"
                  : "Avvia Asta"
              }
            >
              <Gavel className="mr-2 h-4 w-4" />
              {selectedPlayerDetails?.auctionStatus === "active_auction"
                ? "Rilancia"
                : "Avvia"}
            </Button>

            {/* Player Info Inline */}
            {selectedPlayerDetails && (
              <div className="mt-3 flex flex-col items-center gap-3 text-sm md:mt-0 md:flex-row md:border-l md:border-gray-600 md:pl-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-purple-400" />
                  <span className="font-medium text-white">
                    {selectedPlayerDetails.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${selectedPlayerDetails.role === "P"
                      ? "bg-yellow-500 text-gray-900"
                      : ""
                      }${selectedPlayerDetails.role === "D" ? "bg-green-500 text-gray-900" : ""}${selectedPlayerDetails.role === "C"
                        ? "bg-blue-500 text-gray-900"
                        : ""
                      }${selectedPlayerDetails.role === "A" ? "bg-red-500 text-gray-900" : ""}`}
                  >
                    {selectedPlayerDetails.role}
                  </Badge>
                  <span className="text-gray-400">
                    {selectedPlayerDetails.team}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>QtA:{selectedPlayerDetails.qtA}</span>
                  <span>FVM:{selectedPlayerDetails.fvm}</span>
                  {selectedPlayerDetails.auctionStatus === "active_auction" && (
                    <Badge variant="destructive" className="text-xs">
                      ASTA ATTIVA
                    </Badge>
                  )}
                  {selectedPlayerDetails.auctionStatus === "assigned" && (
                    <Badge variant="secondary" className="text-xs">
                      ASSEGNATO
                    </Badge>
                  )}
                  {selectedPlayerDetails.auctionStatus === "no_auction" && (
                    <Badge
                      variant="outline"
                      className="border-green-400 text-xs text-green-400"
                    >
                      DISPONIBILE
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "stats" && (
          <div className="py-8 text-center text-gray-400">
            <TrendingUp className="mx-auto mb-2 h-8 w-8" />
            <p>Statistiche giocatori - Coming Soon</p>
          </div>
        )}

        {activeTab === "filtri" && (
          <div className="space-y-4">
            {/* Reset Filters Button */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">
                Filtri Attivi
              </span>
              <Button
                size="sm"
                variant="outline"
                className="border-gray-600 text-xs text-gray-400 hover:bg-gray-800 hover:text-white"
                onClick={() => {
                  setSelectedRole("ALL");
                  setPreferenceFilters({
                    isStarter: false,
                    isFavorite: false,
                    hasIntegrity: false,
                    hasFmv: false,
                  });
                  toast.success("Tutti i filtri sono stati resettati");
                }}
                title="Reset tutti i filtri"
              >
                Reset Filtri
              </Button>
            </div>

            {/* Role Filter Buttons */}
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-gray-400">Ruoli:</span>
              {roleButtons.map((role) => (
                <Button
                  key={role.key}
                  size="sm"
                  variant={selectedRole === role.key ? "default" : "secondary"}
                  className={`px-3 py-1 text-xs ${selectedRole === role.key
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                    }`}
                  onClick={() => setSelectedRole(role.key)}
                >
                  {role.label}
                </Button>
              ))}
            </div>

            {/* Preference Filters */}
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-gray-400">Preferenze:</span>
              <Button
                size="sm"
                variant="ghost"
                className={`px-3 py-1 text-xs ${preferenceFilters.isStarter
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/90"
                  }`}
                onClick={() =>
                  setPreferenceFilters((prev) => ({
                    ...prev,
                    isStarter: !prev.isStarter,
                  }))
                }
              >
                <Shield className="mr-1 h-4 w-4" />
                Titolari
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className={`px-3 py-1 text-xs ${preferenceFilters.isFavorite
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/90"
                  }`}
                onClick={() =>
                  setPreferenceFilters((prev) => ({
                    ...prev,
                    isFavorite: !prev.isFavorite,
                  }))
                }
              >
                <Heart className="mr-1 h-4 w-4" />
                Preferiti
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className={`px-3 py-1 text-xs ${preferenceFilters.hasIntegrity
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/90"
                  }`}
                onClick={() =>
                  setPreferenceFilters((prev) => ({
                    ...prev,
                    hasIntegrity: !prev.hasIntegrity,
                  }))
                }
              >
                <Dumbbell className="mr-1 h-4 w-4" />
                Integrita
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className={`px-3 py-1 text-xs ${preferenceFilters.hasFmv
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/90"
                  }`}
                onClick={() =>
                  setPreferenceFilters((prev) => ({
                    ...prev,
                    hasFmv: !prev.hasFmv,
                  }))
                }
              >
                <TrendingUp className="mr-1 h-4 w-4" />
                FMV
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Bid Modal */}
      {selectedPlayerForBid && (
        <QuickBidModal
          isOpen={isBidModalOpen}
          onClose={() => {
            setIsBidModalOpen(false);
            setSelectedPlayerForBid(null);
          }}
          player={selectedPlayerForBid}
          leagueId={leagueId}
          userId={userId}
        />
      )}

      {/* Start Auction Modal */}
      {selectedPlayerForStartAuction && (
        <StandardBidModal
          isOpen={isStartAuctionModalOpen}
          onClose={() => {
            setIsStartAuctionModalOpen(false);
            setSelectedPlayerForStartAuction(null);
          }}
          playerName={selectedPlayerForStartAuction.name}
          playerRole={selectedPlayerForStartAuction.role}
          playerTeam={selectedPlayerForStartAuction.team}
          playerId={selectedPlayerForStartAuction.id}
          leagueId={leagueId}
          currentBid={0}
          isNewAuction={true}
          title="Avvia Asta"
          onBidSuccess={handleAuctionStartSuccess}
          playerQtA={selectedPlayerForStartAuction.qtA}
        />
      )}
    </div>
  );
}
