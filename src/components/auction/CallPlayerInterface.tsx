"use client";

import { useEffect, useState } from "react";

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
  const [isLoading, setIsLoading] = useState(false);
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

  // Fetch players data
  const refreshPlayersData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/players?limit=1000&leagueId=${leagueId}`
      );
      if (response.ok) {
        const data = await response.json();
        // Transform API data to match our interface
        const playersWithStatus = (data.players || []).map((player: any) => ({
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
          // Default preferences - these would come from user preferences API
          isStarter: false,
          isFavorite: false,
          integrityValue: 0,
          hasFmv: !!(player.fvm && player.fvm > 0),
        }));
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
  };

  // Initial data fetch
  useEffect(() => {
    refreshPlayersData();
  }, [leagueId]);

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

    if (selectedPlayerDetails.auctionStatus === 'active_auction') {
      handleBidOnPlayer(selectedPlayerDetails);
    } else {
      handleStartAuction();
    }
  };

  const handleStartAuction = () => {
    if (!selectedPlayerDetails) return;

    setSelectedPlayerForStartAuction({
      id: selectedPlayerDetails.id,
      name: selectedPlayerDetails.name,
      role: selectedPlayerDetails.role,
      team: selectedPlayerDetails.team,
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
      const response = await fetch(
        `/api/leagues/${leagueId}/players/${selectedPlayerForStartAuction.id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amount,
            bid_type: bidType,
            auto_bid_max_amount: maxAmount, // Passa il maxAmount per l'auto-bid
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        // Lancia l'errore così che il modale possa catturarlo e mostrarlo
        throw new Error(error.message || "Errore nel creare l'asta");
      }

      toast.success("Asta avviata con successo!");

      // Reset selection after starting auction
      setSelectedPlayer("");
      setSelectedPlayerDetails(null);
      setSelectedPlayerForStartAuction(null);
      // Refresh players data
      await refreshPlayersData();
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
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "chiama"
              ? "bg-muted border-primary text-primary"
              : "hover:bg-muted border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Gavel className="h-4 w-4" />
          CHIAMA
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "stats"
              ? "bg-muted border-primary text-primary"
              : "hover:bg-muted border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          STATS
        </button>
        <button
          onClick={() => setActiveTab("filtri")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === "filtri"
              ? "bg-muted border-primary text-primary"
              : "hover:bg-muted border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Search className="h-4 w-4" />
          FILTRI
        </button>

        {/* Results counter in tab bar */}
        <div className="ml-auto flex items-center px-4 py-3 text-xs text-gray-400">
          {filteredPlayers.length} trovati
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "chiama" && (
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Cerca giocatore o squadra..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchTerm.trim() && setIsDropdownOpen(true)}
                className="h-10 border-input bg-background pl-10 text-foreground placeholder-muted-foreground"
              />

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
                {filteredPlayers.map((player) => (
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
              <div className="flex flex-col md:flex-row items-center gap-3 md:border-l md:border-gray-600 md:pl-3 text-sm mt-3 md:mt-0">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-purple-400" />
                  <span className="font-medium text-white">
                    {selectedPlayerDetails.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${
                      selectedPlayerDetails.role === "P"
                        ? "bg-yellow-500 text-gray-900"
                        : ""
                    }${selectedPlayerDetails.role === "D" ? "bg-green-500 text-gray-900" : ""}${
                      selectedPlayerDetails.role === "C"
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
            {/* Role Filter Buttons */}
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-gray-400">Ruoli:</span>
              {roleButtons.map((role) => (
                <Button
                  key={role.key}
                  size="sm"
                  variant={selectedRole === role.key ? "default" : "secondary"}
                  className={`px-3 py-1 text-xs ${
                    selectedRole === role.key
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
                className={`px-3 py-1 text-xs ${
                  preferenceFilters.isStarter
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
                className={`px-3 py-1 text-xs ${
                  preferenceFilters.isFavorite
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
                className={`px-3 py-1 text-xs ${
                  preferenceFilters.hasIntegrity
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
                className={`px-3 py-1 text-xs ${
                  preferenceFilters.hasFmv
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
          onBidSuccess={refreshPlayersData}
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
