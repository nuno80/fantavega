"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Shield, Star, TrendingUp, Timer, Users } from "lucide-react";

interface Player {
  id: number;
  name: string;
  role: string;
  team: string;
  status: string;
  fmv?: number;
  is_starter?: boolean;
  is_favorite?: boolean;
  is_injured?: boolean;
}

interface CallPlayerInterfaceProps {
  leagueId: number;
  onStartAuction?: (playerId: number) => void;
}

export function CallPlayerInterface({ leagueId, onStartAuction }: CallPlayerInterfaceProps) {
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch available players
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await fetch(`/api/leagues/${leagueId}/players-with-status`);
        if (response.ok) {
          const data = await response.json();
          // Filter only available players (not assigned to any team)
          const availablePlayers = data.filter((player: Player) => player.status === 'available');
          setPlayers(availablePlayers);
        }
      } catch (error) {
        console.error("Error fetching players:", error);
      }
    };

    if (leagueId) {
      fetchPlayers();
    }
  }, [leagueId]);

  // Filter players by role
  const filteredPlayers = players.filter(player => 
    selectedRole === "ALL" || player.role === selectedRole
  );

  // Handle player selection
  const handlePlayerSelect = (playerId: string) => {
    setSelectedPlayer(playerId);
    const player = players.find(p => p.id === parseInt(playerId));
    setSelectedPlayerDetails(player || null);
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
        onStartAuction?.(parseInt(selectedPlayer));
        // Reset selection after starting auction
        setSelectedPlayer("");
        setSelectedPlayerDetails(null);
      } else {
        const error = await response.json();
        console.error("Error starting auction:", error);
      }
    } catch (error) {
      console.error("Error starting auction:", error);
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
              <SelectContent className="bg-gray-700 border-gray-600">
                {filteredPlayers.map((player) => (
                  <SelectItem 
                    key={player.id} 
                    value={player.id.toString()}
                    className="text-white hover:bg-gray-600"
                  >
                    {player.name} ({player.role}) - {player.team}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2"
              onClick={handleStartAuction}
              disabled={!selectedPlayer || isLoading}
            >
              <Gavel className="h-4 w-4" />
            </Button>
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
                <Users className="h-8 w-8 text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm text-gray-400">{selectedPlayerDetails.team}</h3>
                <h2 className="text-xl font-semibold text-white">{selectedPlayerDetails.name}</h2>
                <div className="flex items-center text-xs text-gray-400">
                  <Star className="h-3 w-3 mr-1 text-yellow-400" />
                  <span>{selectedPlayerDetails.role}</span>
                  <span className="mx-1">|</span>
                  <span>{selectedPlayerDetails.status === 'available' ? 'Svincolato' : selectedPlayerDetails.status}</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">NOTE</div>
            </div>

            {/* Player Stats Icons */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
              <div>
                <div className={`rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${
                  selectedPlayerDetails.is_starter ? 'bg-purple-600' : 'bg-gray-700'
                }`}>
                  <Shield className={`h-4 w-4 ${selectedPlayerDetails.is_starter ? 'text-white' : 'text-purple-400'}`} />
                </div>
                <p className="text-white">Titolare</p>
              </div>
              
              <div>
                <div className={`rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${
                  selectedPlayerDetails.is_favorite ? 'bg-purple-600' : 'bg-gray-700'
                }`}>
                  <Users className={`h-4 w-4 ${selectedPlayerDetails.is_favorite ? 'text-white' : 'text-purple-400'}`} />
                </div>
                <p className="text-white">Preferito</p>
              </div>
              
              <div>
                <div className={`rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${
                  !selectedPlayerDetails.is_injured ? 'bg-purple-600' : 'bg-gray-700'
                }`}>
                  <TrendingUp className={`h-4 w-4 ${!selectedPlayerDetails.is_injured ? 'text-white' : 'text-purple-400'}`} />
                </div>
                <p className="text-white">Integro</p>
              </div>
              
              <div>
                <div className="bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1">
                  <Timer className="h-4 w-4 text-purple-400" />
                </div>
                <p className="text-white">FMV</p>
              </div>
            </div>

            {/* FMV Progress Bar */}
            {selectedPlayerDetails.fmv && (
              <>
                <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
                  <div 
                    className="bg-purple-600 h-2.5 rounded-full" 
                    style={{ width: `${Math.min((selectedPlayerDetails.fmv / 100) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className="text-center text-sm text-gray-400 mb-2">
                  FMV: {selectedPlayerDetails.fmv} crediti
                </div>
              </>
            )}

            {/* Role Badge */}
            <div className="flex justify-center">
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
    </div>
  );
}