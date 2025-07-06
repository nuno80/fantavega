"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Shield, Star, TrendingUp, Timer, Users, Search, Clock, User } from "lucide-react";
import { QuickBidModal } from "@/components/players/QuickBidModal";
import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";

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
}

interface CallPlayerInterfaceProps {
  leagueId: number;
  userId: string;
  onStartAuction?: (playerId: number) => void;
}

export function CallPlayerInterface({ leagueId, userId, onStartAuction }: CallPlayerInterfaceProps) {
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [players, setPlayers] = useState<PlayerWithStatus[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerWithStatus[]>([]);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState<PlayerWithStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Bid modal state
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [selectedPlayerForBid, setSelectedPlayerForBid] = useState<PlayerWithAuctionStatus | null>(null);

  // Fetch all players with auction status
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await fetch(`/api/leagues/${leagueId}/players-with-status`);
        if (response.ok) {
          const data = await response.json();
          setPlayers(data);
          setFilteredPlayers(data);
        }
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    if (leagueId) {
      fetchPlayers();
    }
  }, [leagueId]);

  // Filter players based on role and search term
  useEffect(() => {
    let filtered = players;

    // Filter by role
    if (selectedRole !== "ALL") {
      filtered = filtered.filter(player => player.role === selectedRole);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(player => 
        player.name.toLowerCase().includes(term) ||
        player.team.toLowerCase().includes(term)
      );
    }

    setFilteredPlayers(filtered);
  }, [players, selectedRole, searchTerm]);

  // Handle player selection
  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayer(playerId);
    const player = filteredPlayers.find(p => p.id === parseInt(playerId));
    setSelectedPlayerDetails(player || null);
  };

  // Handle bid on player
  const handleBidOnPlayer = (player: PlayerWithStatus) => {
    // Convert to PlayerWithAuctionStatus format
    const playerForBid: PlayerWithAuctionStatus = {
      ...player,
      // Ensure all required properties are present
      roleDetail: player.roleDetail || "",
      qtA: player.qtA || 0,
      qtI: player.qtI || 0,
      diff: player.diff || 0,
      qtAM: player.qtAM || 0,
      qtIM: player.qtIM || 0,
      diffM: player.diffM || 0,
      fvm: player.fvm || 0,
      fvmM: player.fvmM || 0,
    };
    
    setSelectedPlayerForBid(playerForBid);
    setIsBidModalOpen(true);
  };

  // Refresh players data after bid
  const refreshPlayersData = async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/players-with-status`);
      if (response.ok) {
        const data = await response.json();
        setPlayers(data);
        setFilteredPlayers(data);
      }
    } catch (error) {
      console.error("Error refreshing players:", error);
    }
  };

  // Handle starting auction
  const handleStartAuction = async () => {
    if (!selectedPlayer || !selectedPlayerDetails) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/leagues/${leagueId}/start-auction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: parseInt(selectedPlayer) }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success("Asta avviata con successo!");
        onStartAuction?.(parseInt(selectedPlayer));
        // Reset selection after starting auction
        setSelectedPlayer("");
        setSelectedPlayerDetails(null);
        // Refresh players data
        refreshPlayersData();
      } else {
        // Get the error message from response
        const responseText = await response.text();
        let error;
        try {
          error = responseText ? JSON.parse(responseText) : { error: "Errore sconosciuto" };
        } catch (parseError) {
          error = { error: "Errore di comunicazione con il server" };
        }
        
        // Show specific error message
        if (response.status === 403) {
          toast.error(error.error || "Non hai i permessi per avviare aste");
        } else if (response.status === 400) {
          toast.error(error.error || "Errore nella richiesta");
        } else if (response.status === 404) {
          toast.error(error.error || "Risorsa non trovata");
        } else {
          toast.error(error.error || "Errore nell'avviare l'asta");
        }
      }
    } catch (error) {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
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
    <div className="h-full flex flex-col space-y-4">
      {/* Call Player Section */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-white">CHIAMA UN GIOCATORE</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Cerca giocatore o squadra..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
          </div>

          {/* Role Filter Buttons */}
          <div className="flex space-x-1">
            {roleButtons.map((role) => (
              <Button
                key={role.key}
                size="sm"
                variant={selectedRole === role.key ? "default" : "secondary"}
                className={`px-3 py-1 text-xs ${
                  selectedRole === role.key 
                    ? "bg-red-600 hover:bg-red-700 text-white" 
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                }`}
                onClick={() => setSelectedRole(role.key)}
              >
                {role.label}
              </Button>
            ))}
          </div>

          {/* Player Selection */}
          <div className="flex items-center space-x-2">
            <Select value={selectedPlayer} onValueChange={handlePlayerSelect}>
              <SelectTrigger className="flex-1 bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder="Seleziona un Giocatore" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600 max-h-60">
                {filteredPlayers.map((player) => (
                  <SelectItem 
                    key={player.id} 
                    value={player.id.toString()}
                    className="text-white hover:bg-gray-600"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{player.name} ({player.role}) - {player.team}</span>
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
            
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2"
              onClick={handleStartAuction}
              disabled={!selectedPlayer || isLoading || selectedPlayerDetails?.auctionStatus !== "no_auction"}
              title="Avvia Asta"
            >
              <Gavel className="h-4 w-4" />
            </Button>
          </div>

          {/* Results Count */}
          <div className="text-xs text-gray-400">
            {filteredPlayers.length} giocatori trovati
          </div>
        </CardContent>
      </Card>

      {/* Player Details Section */}
      {selectedPlayerDetails && (
        <Card className="bg-gray-800 border-gray-700 flex-1">
          <CardContent className="p-4">
            {/* Player Header */}
            <div className="flex items-center mb-3">
              <div className="h-16 w-16 rounded-full mr-3 border-2 border-purple-500 bg-gray-700 flex items-center justify-center">
                <User className="h-8 w-8 text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm text-gray-400">{selectedPlayerDetails.team}</h3>
                <h2 className="text-xl font-semibold text-white">{selectedPlayerDetails.name}</h2>
                <div className="flex items-center text-xs text-gray-400">
                  <Star className="h-3 w-3 mr-1 text-yellow-400" />
                  <span>{selectedPlayerDetails.role}</span>
                  {selectedPlayerDetails.roleDetail && (
                    <>
                      <span className="mx-1">|</span>
                      <span>{selectedPlayerDetails.roleDetail}</span>
                    </>
                  )}
                </div>
              </div>
              
              {/* Auction Status Badge */}
              <div className="text-right">
                {selectedPlayerDetails.auctionStatus === "active_auction" && (
                  <Badge variant="destructive" className="mb-1">
                    ASTA ATTIVA
                  </Badge>
                )}
                {selectedPlayerDetails.auctionStatus === "assigned" && (
                  <Badge variant="secondary" className="mb-1">
                    ASSEGNATO
                  </Badge>
                )}
                {selectedPlayerDetails.auctionStatus === "no_auction" && (
                  <Badge variant="outline" className="mb-1 text-green-400 border-green-400">
                    DISPONIBILE
                  </Badge>
                )}
              </div>
            </div>

            {/* Player Stats */}
            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
              <div>
                <span className="text-gray-400">Qt.A:</span>
                <span className="ml-1 font-medium text-white">{selectedPlayerDetails.qtA}</span>
              </div>
              <div>
                <span className="text-gray-400">Qt.I:</span>
                <span className="ml-1 font-medium text-white">{selectedPlayerDetails.qtI}</span>
              </div>
              <div>
                <span className="text-gray-400">FVM:</span>
                <span className="ml-1 font-medium text-white">{selectedPlayerDetails.fvm}</span>
              </div>
              <div>
                <span className="text-gray-400">Diff:</span>
                <span className={`ml-1 font-medium ${selectedPlayerDetails.diff > 0 ? 'text-green-400' : selectedPlayerDetails.diff < 0 ? 'text-red-400' : 'text-white'}`}>
                  {selectedPlayerDetails.diff > 0 ? '+' : ''}{selectedPlayerDetails.diff}
                </span>
              </div>
            </div>

            {/* Auction Info */}
            {selectedPlayerDetails.auctionStatus === "active_auction" && (
              <div className="space-y-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Offerta Attuale:</span>
                  <span className="font-bold text-orange-600">
                    {selectedPlayerDetails.currentBid || 0} crediti
                  </span>
                </div>
                
                {selectedPlayerDetails.currentHighestBidderName && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Miglior offerente:</span>
                    <span className="text-sm font-medium text-orange-700">
                      {selectedPlayerDetails.currentHighestBidderName}
                    </span>
                  </div>
                )}

                {selectedPlayerDetails.timeRemaining && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tempo rimanente:</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.max(0, Math.floor(selectedPlayerDetails.timeRemaining / 1000))}s
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {selectedPlayerDetails.auctionStatus === "active_auction" && (
                <Button
                  onClick={() => handleBidOnPlayer(selectedPlayerDetails)}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                  size="sm"
                >
                  <Gavel className="h-4 w-4 mr-2" />
                  Fai Offerta
                </Button>
              )}
              
              {selectedPlayerDetails.auctionStatus === "no_auction" && (
                <Button
                  onClick={handleStartAuction}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                  disabled={isLoading}
                >
                  <Gavel className="h-4 w-4 mr-2" />
                  Avvia Asta
                </Button>
              )}
            </div>

            {/* Role Badge */}
            <div className="flex justify-center mt-4">
              <Badge 
                variant="secondary" 
                className={`
                  ${selectedPlayerDetails.role === 'P' ? 'bg-yellow-500 text-gray-900' : ''}
                  ${selectedPlayerDetails.role === 'D' ? 'bg-green-500 text-gray-900' : ''}
                  ${selectedPlayerDetails.role === 'C' ? 'bg-blue-500 text-gray-900' : ''}
                  ${selectedPlayerDetails.role === 'A' ? 'bg-red-500 text-gray-900' : ''}
                  font-semibold
                `}
              >
                {selectedPlayerDetails.role}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!selectedPlayerDetails && (
        <Card className="bg-gray-800 border-gray-700 flex-1">
          <CardContent className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">Seleziona un giocatore per vedere i dettagli</p>
            </div>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}