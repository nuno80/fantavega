"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Clock, Gavel, User, Users, Shield, Timer, TrendingUp, Ban } from "lucide-react";
import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";
import { useState, useEffect } from "react";

interface PlayerSearchCardProps {
  player: PlayerWithAuctionStatus;
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;
  onStartAuction: (playerId: number) => void;
  userRole: string;
  userId: string;
  onTogglePlayerIcon?: (playerId: number, iconType: 'isStarter' | 'isFavorite' | 'integrityValue' | 'hasFmv', value: boolean | number) => void;
}

export function PlayerSearchCard({
  player,
  onBidOnPlayer,
  onStartAuction,
  userRole,
  userId,
  onTogglePlayerIcon,
}: PlayerSearchCardProps) {
  const [cooldownTimeRemaining, setCooldownTimeRemaining] = useState<number | null>(
    player.cooldownInfo?.timeRemaining || null
  );

  // Aggiorna il timer ogni minuto
  useEffect(() => {
    if (!player.cooldownInfo?.timeRemaining) return;

    setCooldownTimeRemaining(player.cooldownInfo.timeRemaining);

    const interval = setInterval(() => {
      setCooldownTimeRemaining(prev => {
        if (prev === null || prev <= 60) return null; // Se meno di 1 minuto, rimuovi cooldown
        return prev - 60; // Sottrai 1 minuto
      });
    }, 60000); // Aggiorna ogni minuto

    return () => clearInterval(interval);
  }, [player.cooldownInfo?.timeRemaining]);

  const formatCooldownTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "P":
        return "bg-yellow-500 text-yellow-900";
      case "D":
        return "bg-green-500 text-green-900";
      case "C":
        return "bg-blue-500 text-blue-900";
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

  const hasCooldown = cooldownTimeRemaining !== null && cooldownTimeRemaining > 0;
  const canBid = (player.auctionStatus === "active_auction" || player.auctionStatus === "no_auction") && !player.isAssignedToUser && !hasCooldown;
  const canStartAuction = false; // Rimosso: ora si usa sempre "Fai Offerta"

  return (
    <Card className="h-full flex flex-col relative">
      
      
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
        {/* Player Icons Grid */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
          <div>
            <div
              className={`bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${player.isStarter ? 'border-2 border-purple-400' : ''} cursor-pointer hover:bg-gray-600 transition-colors`}
              onClick={() => onTogglePlayerIcon && onTogglePlayerIcon(player.id, 'isStarter', !player.isStarter)}
              title={player.isStarter ? "Rimuovi come titolare" : "Segna come titolare"}
            >
              <Shield className={`h-4 w-4 ${player.isStarter ? 'text-purple-400' : 'text-gray-400'}`} />
            </div>
            <p className={player.isStarter ? 'text-purple-400' : 'text-gray-400'}>Titolare</p>
          </div>
          <div>
            <div
              className={`bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${player.isFavorite ? 'border-2 border-purple-400' : ''} cursor-pointer hover:bg-gray-600 transition-colors`}
              onClick={() => onTogglePlayerIcon && onTogglePlayerIcon(player.id, 'isFavorite', !player.isFavorite)}
              title={player.isFavorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
            >
              <div className={`h-4 w-4 ${player.isFavorite ? 'text-purple-400' : 'text-gray-400'}`}>⚽</div>
            </div>
            <p className={player.isFavorite ? 'text-purple-400' : 'text-gray-400'}>Preferito</p>
          </div>
          <div>
            <div
              className={`bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${player.integrityValue ? 'border-2 border-purple-400' : ''} cursor-pointer hover:bg-gray-600 transition-colors`}
              onClick={() => onTogglePlayerIcon && onTogglePlayerIcon(player.id, 'integrityValue', player.integrityValue ? 0 : 1)}
              title={player.integrityValue ? "Rimuovi integrità" : "Segna come integro"}
            >
              <TrendingUp className={`h-4 w-4 ${player.integrityValue ? 'text-purple-400' : 'text-gray-400'}`} />
            </div>
            <p className={player.integrityValue ? 'text-purple-400' : 'text-gray-400'}>Integrità</p>
          </div>
          <div>
            <div
              className={`bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-1 ${player.hasFmv ? 'border-2 border-purple-400' : ''} cursor-pointer hover:bg-gray-600 transition-colors`}
              onClick={() => onTogglePlayerIcon && onTogglePlayerIcon(player.id, 'hasFmv', !player.hasFmv)}
              title={player.hasFmv ? "Rimuovi FMV" : "Segna con FMV"}
            >
              <Timer className={`h-4 w-4 ${player.hasFmv ? 'text-purple-400' : 'text-gray-400'}`} />
            </div>
            <p className={player.hasFmv ? 'text-purple-400' : 'text-gray-400'}>FMV</p>
          </div>
        </div>

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
          <div className="space-y-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
            {/* Current Bid Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Offerta Attuale:</span>
                <span className="font-bold text-orange-600">
                  {player.currentBid || 0} crediti
                </span>
              </div>
              
              {player.currentHighestBidderName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Miglior offerente:</span>
                  <span className="text-sm font-medium text-orange-700">
                    {player.currentHighestBidderName}
                  </span>
                </div>
              )}
              
              {player.timeRemaining && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tempo rimanente:</span>
                  <span className="text-sm font-medium text-orange-600">
                    {formatTimeRemaining(player.timeRemaining)}
                  </span>
                </div>
              )}
            </div>

            {/* Auto-bid Info */}
            {player.autoBids && player.autoBids.length > 0 && (
              <div className="border-t border-orange-200 dark:border-orange-800 pt-2">
                <div className="text-xs font-medium text-orange-700 mb-1">Auto-offerte attive:</div>
                <div className="space-y-1">
                  {player.autoBids.map((autoBid, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className={`${autoBid.userId === userId ? 'font-semibold text-blue-600' : 'text-muted-foreground'}`}>
                        {autoBid.username}
                        {autoBid.userId === userId && ' (Tu)'}
                      </span>
                      <span className="font-medium">
                        {autoBid.userId === userId ? `Max: ${autoBid.maxAmount}` : 'Auto-bid attiva'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User's Auto-bid Status */}
            {player.userAutoBid && (
              <div className="border-t border-blue-200 dark:border-blue-800 pt-2 bg-blue-50 dark:bg-blue-950/30 -mx-3 px-3 pb-2 rounded-b-lg">
                <div className="text-xs font-medium text-blue-700 mb-1">La tua auto-offerta:</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600">Prezzo massimo:</span>
                  <span className="font-bold text-blue-700">{player.userAutoBid.maxAmount} crediti</span>
                </div>
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
        {hasCooldown && (
          <div className="flex gap-2 w-full">
            <Button 
              variant="destructive"
              className="!opacity-100 disabled:opacity-100 py-3 px-4"
              size="sm"
              disabled
            >
              <Ban className="h-4 w-4 mr-2" />
              {formatCooldownTime(cooldownTimeRemaining)}
            </Button>
            <Button 
              variant="outline"
              className="flex-1 py-3 px-4"
              size="sm"
              disabled
            >
              Non puoi fare offerte ora
            </Button>
          </div>
        )}
        
        {canBid && !hasCooldown && (
          <Button 
            onClick={() => onBidOnPlayer(player)}
            className="w-full"
            size="sm"
          >
            <Gavel className="h-4 w-4 mr-2" />
            Fai Offerta
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
        
        {!canBid && player.auctionStatus === "no_auction" && (
          <Button
            variant="outline"
            className="w-full"
            size="sm"
            disabled
          >
            <User className="h-4 w-4 mr-2" />
            Non disponibile per asta
          </Button>
        )}
        
        {!canBid && player.auctionStatus === "active_auction" && !player.isAssignedToUser && !player.canStartAuction && (
          <Button
            variant="outline"
            className="w-full"
            size="sm"
            disabled
          >
            <Gavel className="h-4 w-4 mr-5" />
            {player.currentHighestBidderName === "Tu" ? "Sei già il miglior offerente" : "Non puoi fare offerte ora"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}