"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Clock, Gavel, User, Users } from "lucide-react";
import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";

interface PlayerSearchCardProps {
  player: PlayerWithAuctionStatus;
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;
  onStartAuction: (playerId: number) => void;
  userRole: string;
  userId: string;
}

export function PlayerSearchCard({
  player,
  onBidOnPlayer,
  onStartAuction,
  userRole,
  userId,
}: PlayerSearchCardProps) {
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "P":
        return "bg-yellow-500 text-yellow-900";
      case "D":
        return "bg-blue-500 text-blue-900";
      case "C":
        return "bg-green-500 text-green-900";
      case "A":
        return "bg-red-500 text-red-900";
      default:
        return "bg-gray-500 text-gray-900";
    }
  };

  const getStatusBadge = () => {
    switch (player.auctionStatus) {
      case "active_auction":
        return (
          <Badge className="bg-orange-500 text-orange-900">
            <Clock className="h-3 w-3 mr-1" />
            Asta Attiva
          </Badge>
        );
      case "assigned":
        return (
          <Badge className="bg-gray-500 text-gray-900">
            <Users className="h-3 w-3 mr-1" />
            Assegnato
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <User className="h-3 w-3 mr-1" />
            Disponibile
          </Badge>
        );
    }
  };

  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return null;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const canBid = player.auctionStatus === "active_auction" && !player.isAssignedToUser;
  const canStartAuction = userRole === "admin" && player.auctionStatus === "no_auction" && player.canStartAuction;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={getRoleBadgeColor(player.role)}>
                {player.role}
              </Badge>
              {player.roleDetail && (
                <Badge variant="outline" className="text-xs">
                  {player.roleDetail}
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-lg leading-tight">{player.name}</h3>
            <p className="text-sm text-muted-foreground">{player.team}</p>
          </div>
          
          {/* Player Avatar */}
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        
        {getStatusBadge()}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Player Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Qt.A:</span>
            <span className="ml-1 font-medium">{player.qtA}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Qt.I:</span>
            <span className="ml-1 font-medium">{player.qtI}</span>
          </div>
          <div>
            <span className="text-muted-foreground">FVM:</span>
            <span className="ml-1 font-medium">{player.fvm}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Diff:</span>
            <span className={`ml-1 font-medium ${player.diff > 0 ? 'text-green-600' : player.diff < 0 ? 'text-red-600' : ''}`}>
              {player.diff > 0 ? '+' : ''}{player.diff}
            </span>
          </div>
        </div>

        {/* Auction Info */}
        {player.auctionStatus === "active_auction" && (
          <div className="space-y-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Offerta Attuale:</span>
              <span className="font-bold text-orange-600">
                {player.currentBid || 0} crediti
              </span>
            </div>
            {player.timeRemaining && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tempo:</span>
                <span className="text-sm font-medium text-orange-600">
                  {formatTimeRemaining(player.timeRemaining)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Assignment Info */}
        {player.auctionStatus === "assigned" && player.assignedToTeam && (
          <div className="p-3 bg-gray-50 dark:bg-gray-950/20 rounded-lg">
            <div className="text-sm">
              <span className="text-muted-foreground">Assegnato a:</span>
              <span className="ml-1 font-medium">{player.assignedToTeam}</span>
            </div>
            {player.currentBid && (
              <div className="text-sm mt-1">
                <span className="text-muted-foreground">Prezzo:</span>
                <span className="ml-1 font-medium">{player.currentBid} crediti</span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3">
        {canBid && (
          <Button 
            onClick={() => onBidOnPlayer(player)}
            className="w-full"
            size="sm"
          >
            <Gavel className="h-4 w-4 mr-2" />
            Fai Offerta
          </Button>
        )}
        
        {canStartAuction && (
          <Button 
            onClick={() => onStartAuction(player.id)}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <Clock className="h-4 w-4 mr-2" />
            Avvia Asta
          </Button>
        )}
        
        {player.auctionStatus === "assigned" && (
          <Button 
            variant="secondary"
            className="w-full"
            size="sm"
            disabled
          >
            <Users className="h-4 w-4 mr-2" />
            Già Assegnato
          </Button>
        )}
        
        {player.auctionStatus === "no_auction" && !canStartAuction && (
          <Button 
            variant="outline"
            className="w-full"
            size="sm"
            disabled
          >
            <User className="h-4 w-4 mr-2" />
            Disponibile
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}