"use client";

import { useEffect, useState } from "react";

import {
  Ban,
  Clock,
  Gavel,
  Shield,
  Timer,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface PlayerSearchCardProps {
  player: PlayerWithAuctionStatus;
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;
  onStartAuction: (playerId: number) => void;
  userRole: string;
  userId: string;
  onTogglePlayerIcon?: (
    playerId: number,
    iconType: "isStarter" | "isFavorite" | "integrityValue" | "hasFmv",
    value: boolean | number
  ) => void;
  leagueId?: number;
}

export function PlayerSearchCard({
  player,
  onBidOnPlayer,
  onStartAuction,
  userRole,
  userId,
  onTogglePlayerIcon,
  leagueId,
}: PlayerSearchCardProps) {
  const [cooldownTimeRemaining, setCooldownTimeRemaining] = useState<
    number | null
  >(player.cooldownInfo?.timeRemaining || null);

  // Funzione per gestire il toggle delle preferenze
  const handleTogglePreference = async (
    iconType: "isStarter" | "isFavorite" | "integrityValue" | "hasFmv",
    value: boolean | number
  ) => {
    if (!leagueId) {
      console.error("League ID is required for player preferences");
      return;
    }

    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/players/${player.id}/preferences`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            iconType,
            value,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error("Error updating preference:", error);
        return;
      }

      // Se c'è un callback esterno, chiamalo per aggiornare lo stato del parent
      if (onTogglePlayerIcon) {
        onTogglePlayerIcon(player.id, iconType, value);
      }
    } catch (error) {
      console.error("Error updating player preference:", error);
    }
  };

  // Aggiorna il timer ogni minuto
  useEffect(() => {
    if (!player.cooldownInfo?.timeRemaining) return;

    setCooldownTimeRemaining(player.cooldownInfo.timeRemaining);

    const interval = setInterval(() => {
      setCooldownTimeRemaining((prev) => {
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
            <Clock className="mr-1 h-3 w-3" />
            Asta Attiva
          </Badge>
        );
      case "assigned":
        return (
          <Badge className="bg-gray-500 text-gray-900">
            <Users className="mr-1 h-3 w-3" />
            Assegnato
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <User className="mr-1 h-3 w-3" />
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

  const hasCooldown =
    cooldownTimeRemaining !== null && cooldownTimeRemaining > 0;
  const canBid =
    (player.auctionStatus === "active_auction" ||
      player.auctionStatus === "no_auction") &&
    !player.isAssignedToUser &&
    !hasCooldown;
  const canStartAuction = false; // Rimosso: ora si usa sempre "Fai Offerta"

  return (
    <Card className="relative flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Badge className={getRoleBadgeColor(player.role)}>
                {player.role}
              </Badge>
              {player.roleDetail && (
                <Badge variant="outline" className="text-xs">
                  {player.roleDetail}
                </Badge>
              )}
            </div>
            <h3 className="text-lg font-semibold leading-tight">
              {player.name}
            </h3>
            <p className="text-sm text-muted-foreground">{player.team}</p>
          </div>

          {/* Player Avatar */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>

        {getStatusBadge()}
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Player Icons Grid */}
        <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <div
              className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 ${player.isStarter ? "border-2 border-purple-400" : ""} cursor-pointer transition-colors hover:bg-gray-600`}
              onClick={() =>
                handleTogglePreference("isStarter", !player.isStarter)
              }
              title={
                player.isStarter
                  ? "Rimuovi come titolare"
                  : "Segna come titolare"
              }
            >
              <Shield
                className={`h-4 w-4 ${player.isStarter ? "text-purple-400" : "text-gray-400"}`}
              />
            </div>
            <p
              className={player.isStarter ? "text-purple-400" : "text-gray-400"}
            >
              Titolare
            </p>
          </div>
          <div>
            <div
              className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 ${player.isFavorite ? "border-2 border-purple-400" : ""} cursor-pointer transition-colors hover:bg-gray-600`}
              onClick={() =>
                handleTogglePreference("isFavorite", !player.isFavorite)
              }
              title={
                player.isFavorite
                  ? "Rimuovi dai preferiti"
                  : "Aggiungi ai preferiti"
              }
            >
              <div
                className={`h-4 w-4 ${player.isFavorite ? "text-purple-400" : "text-gray-400"}`}
              >
                ⚽
              </div>
            </div>
            <p
              className={
                player.isFavorite ? "text-purple-400" : "text-gray-400"
              }
            >
              Preferito
            </p>
          </div>
          <div>
            <div
              className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 ${player.integrityValue ? "border-2 border-purple-400" : ""} cursor-pointer transition-colors hover:bg-gray-600`}
              onClick={() =>
                handleTogglePreference(
                  "integrityValue",
                  player.integrityValue ? 0 : 1
                )
              }
              title={
                player.integrityValue
                  ? "Rimuovi integrità"
                  : "Segna come integro"
              }
            >
              <Timer
                className={`h-4 w-4 ${player.integrityValue ? "text-purple-400" : "text-gray-400"}`}
              />
            </div>
            <p
              className={
                player.integrityValue ? "text-purple-400" : "text-gray-400"
              }
            >
              Integrità
            </p>
          </div>
          <div>
            <div
              className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 ${player.hasFmv ? "border-2 border-purple-400" : ""} cursor-pointer transition-colors hover:bg-gray-600`}
              onClick={() =>
                handleTogglePreference("hasFmv", !player.hasFmv)
              }
              title={player.hasFmv ? "Rimuovi FMV" : "Segna con FMV"}
            >
              <TrendingUp
                className={`h-4 w-4 ${player.hasFmv ? "text-purple-400" : "text-gray-400"}`}
              />
            </div>
            <p className={player.hasFmv ? "text-purple-400" : "text-gray-400"}>
              FMV
            </p>
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
            <span
              className={`ml-1 font-medium ${player.diff > 0 ? "text-green-600" : player.diff < 0 ? "text-red-600" : ""}`}
            >
              {player.diff > 0 ? "+" : ""}
              {player.diff}
            </span>
          </div>
        </div>

        {/* Auction Info */}
        {player.auctionStatus === "active_auction" && (
          <div className="space-y-3 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/20">
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
                  <span className="text-sm text-muted-foreground">
                    Miglior offerente:
                  </span>
                  <span className="text-sm font-medium text-orange-700">
                    {player.currentHighestBidderName}
                  </span>
                </div>
              )}

              {player.timeRemaining && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Tempo rimanente:
                  </span>
                  <span className="text-sm font-medium text-orange-600">
                    {formatTimeRemaining(player.timeRemaining)}
                  </span>
                </div>
              )}
            </div>

            {/* Auto-bid Info */}
            {player.autoBids && player.autoBids.length > 0 && (
              <div className="border-t border-orange-200 pt-2 dark:border-orange-800">
                <div className="mb-1 text-xs font-medium text-orange-700">
                  Auto-offerte attive:
                </div>
                <div className="space-y-1">
                  {player.autoBids.map((autoBid, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-xs"
                    >
                      <span
                        className={`${autoBid.userId === userId ? "font-semibold text-blue-600" : "text-muted-foreground"}`}
                      >
                        {autoBid.username}
                        {autoBid.userId === userId && " (Tu)"}
                      </span>
                      <span className="font-medium">
                        {autoBid.userId === userId
                          ? `Max: ${autoBid.maxAmount}`
                          : "Auto-bid attiva"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User's Auto-bid Status */}
            {player.userAutoBid && (
              <div className="-mx-3 rounded-b-lg border-t border-blue-200 bg-blue-50 px-3 pb-2 pt-2 dark:border-blue-800 dark:bg-blue-950/30">
                <div className="mb-1 text-xs font-medium text-blue-700">
                  La tua auto-offerta:
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600">Prezzo massimo:</span>
                  <span className="font-bold text-blue-700">
                    {player.userAutoBid.maxAmount} crediti
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Assignment Info */}
        {player.auctionStatus === "assigned" && player.assignedToTeam && (
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-950/20">
            <div className="text-sm">
              <span className="text-muted-foreground">Assegnato a:</span>
              <span className="ml-1 font-medium">{player.assignedToTeam}</span>
            </div>
            {player.currentBid && (
              <div className="mt-1 text-sm">
                <span className="text-muted-foreground">Prezzo:</span>
                <span className="ml-1 font-medium">
                  {player.currentBid} crediti
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3">
        {hasCooldown && (
          <div className="flex w-full gap-2">
            <Button
              variant="destructive"
              className="px-4 py-3 !opacity-100 disabled:opacity-100"
              size="sm"
              disabled
            >
              <Ban className="mr-1 h-4 w-4" />
              {formatCooldownTime(cooldownTimeRemaining)}
            </Button>
            <Button
              variant="outline"
              className="flex-1 px-4 py-3"
              size="sm"
              disabled
            >
              <Gavel className="mr-1 h-4 w-4" />
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
            <Gavel className="mr-2 h-4 w-4" />
            Fai Offerta
          </Button>
        )}

        {player.auctionStatus === "assigned" && (
          <Button variant="secondary" className="w-full" size="sm" disabled>
            <Users className="mr-2 h-4 w-4" />
            Già Assegnato
          </Button>
        )}

        {!canBid && player.auctionStatus === "no_auction" && (
          <Button variant="outline" className="w-full" size="sm" disabled>
            <User className="mr-2 h-4 w-4" />
            Non disponibile per asta
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
