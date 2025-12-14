"use client";

import { useEffect, useState } from "react";

import {
  Activity,
  Ban,
  Clock,
  Gavel,
  Gem,
  Heart,
  Shirt,
  Trophy,
  User,
  Users
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
import {
  getFantacalcioImageUrl,
  getPlayerImageUrl,
  getTeamLogoUrl,
} from "@/lib/utils";
interface PlayerSearchCardProps {
  player: PlayerWithAuctionStatus;
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;

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

  userRole: _userRole,
  userId: _userId,
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

  // Pastel color system matching Auction page
  const getRolePastelColor = (role: string) => {
    switch (role.toUpperCase()) {
      case "P":
        return "bg-yellow-100 border-yellow-200 text-yellow-900 dark:bg-yellow-500/20 dark:border-yellow-500/50 dark:text-yellow-300";
      case "D":
        return "bg-green-100 border-green-200 text-green-900 dark:bg-green-500/20 dark:border-green-500/50 dark:text-green-300";
      case "C":
        return "bg-blue-100 border-blue-200 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-300";
      case "A":
        return "bg-red-100 border-red-200 text-red-900 dark:bg-red-500/20 dark:border-red-500/50 dark:text-red-300";
      default:
        return "bg-gray-100 border-gray-200 text-gray-900 dark:bg-gray-500/20 dark:border-gray-500/50 dark:text-gray-300";
    }
  };

  const getStatusDisplay = () => {
    switch (player.auctionStatus) {
      case "active_auction":
        return {
          badge: (
            <Badge className="bg-orange-500 text-orange-900">
              <Clock className="mr-1 h-3 w-3" />
              Asta Attiva
            </Badge>
          ),
          info: null,
        };
      case "assigned":
        return {
          badge: (
            <Badge className="bg-gray-500 text-gray-900">
              <Trophy className="mr-1 h-3 w-3" />
              {player.assignedToTeam}
            </Badge>
          ),
          info: player.currentBid ? (
            <div className="text-sm text-muted-foreground">
              {player.currentBid} crediti
            </div>
          ) : null,
        };
      default:
        return {
          badge: (
            <Badge variant="outline">
              <User className="mr-1 h-3 w-3" />
              Disponibile
            </Badge>
          ),
          info: null,
        };
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

  const statusDisplay = getStatusDisplay();

  return (
    <Card
      className={`relative flex h-full flex-col transition-shadow hover:shadow-lg ${player.auctionStatus === "assigned"
        ? "border-red-500 bg-orange-100 dark:border-orange-800 dark:bg-orange-950/20"
        : ""
        }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge className={`border ${getRolePastelColor(player.role)}`}>
                {player.role}
              </Badge>
              {player.roleDetail && (
                <Badge variant="outline" className="text-xs">
                  {player.roleDetail}
                </Badge>
              )}
            </div>
            <h3 className="mb-1 truncate text-lg font-semibold leading-tight">
              {player.name}
            </h3>
            <p className="mb-2 text-sm text-muted-foreground">{player.team}</p>

            <div className="flex items-center gap-2">{statusDisplay.badge}</div>
            {statusDisplay.info && (
              <div className="mt-1">{statusDisplay.info}</div>
            )}
          </div>

          {/* Player Avatar */}
          <div className="ml-2 flex flex-col items-center gap-1">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-muted bg-muted shadow-sm relative">
              {(player.photo_url || player.id || player.name) && (
                <img
                  src={getPlayerImageUrl(
                    player.id,
                    player.photo_url,
                    player.name,
                    player.team
                  )}
                  alt={player.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const fantaUrl =
                      player.id && getFantacalcioImageUrl(player.id);
                    const teamLogo = getTeamLogoUrl(player.team || "");

                    // Checks to avoid loops
                    if (
                      fantaUrl &&
                      target.src !== fantaUrl &&
                      !target.src.includes("fantacalcio.it")
                    ) {
                      target.src = fantaUrl;
                    } else if (
                      teamLogo &&
                      target.src !== teamLogo &&
                      !target.src.includes(teamLogo)
                    ) {
                      target.src = teamLogo;
                      target.className = "h-20 w-20 object-contain";
                      target.onerror = () => {
                        target.style.display = "none";
                        target.parentElement
                          ?.querySelector(".fallback-icon")
                          ?.classList.remove("hidden");
                      };
                    } else {
                      target.style.display = "none";
                      target.parentElement
                        ?.querySelector(".fallback-icon")
                        ?.classList.remove("hidden");
                    }
                  }}
                />
              )}
              <User className="fallback-icon hidden h-12 w-12 text-muted-foreground absolute" />
              <div
                className={`fallback-icon absolute flex h-full w-full items-center justify-center ${player.photo_url || player.id || player.name ? "hidden" : ""
                  }`}
              >
                <User className="h-12 w-12 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {/* Compact Player Stats */}
        <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/30 p-2 text-sm">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Qt.A</div>
            <div className="font-medium">{player.qtA}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Qt.I</div>
            <div className="font-medium">{player.qtI}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">FVM</div>
            <div className="font-medium">{player.fvm}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Diff</div>
            <div
              className={`font-medium ${player.diff > 0 ? "text-green-600" : player.diff < 0 ? "text-red-600" : ""}`}
            >
              {player.diff > 0 ? "+" : ""}
              {player.diff}
            </div>
          </div>
        </div>

        {/* Compact User Preferences (always visible but clickable) */}
        <div className="grid grid-cols-4 gap-2">
          <button
            className={`rounded-lg p-2 transition-colors ${player.isStarter
              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            onClick={() =>
              handleTogglePreference("isStarter", !player.isStarter)
            }
            title={
              player.isStarter ? "Rimuovi come titolare" : "Segna come titolare"
            }
          >
            <Shirt className="mx-auto mb-1 h-4 w-4" />
            <div className="text-xs">Titolare</div>
          </button>

          <button
            className={`rounded-lg p-2 transition-colors ${player.isFavorite
              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            onClick={() =>
              handleTogglePreference("isFavorite", !player.isFavorite)
            }
            title={
              player.isFavorite
                ? "Rimuovi dai preferiti"
                : "Aggiungi ai preferiti"
            }
          >
            <Heart className={`mx-auto mb-1 h-4 w-4 ${player.isFavorite ? "fill-current" : ""}`} />
            <div className="text-xs">Preferito</div>
          </button>

          <button
            className={`rounded-lg p-2 transition-colors ${player.integrityValue
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            onClick={() =>
              handleTogglePreference(
                "integrityValue",
                player.integrityValue ? 0 : 1
              )
            }
            title={
              player.integrityValue ? "Rimuovi integrità" : "Segna come integro"
            }
          >
            <Activity className="mx-auto mb-1 h-4 w-4" />
            <div className="text-xs">Integrità</div>
          </button>

          <button
            className={`rounded-lg p-2 transition-colors ${player.hasFmv
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            onClick={() => handleTogglePreference("hasFmv", !player.hasFmv)}
            title={player.hasFmv ? "Rimuovi FMV" : "Segna con FMV"}
          >
            <Gem className="mx-auto mb-1 h-4 w-4" />
            <div className="text-xs">FMV</div>
          </button>
        </div>

        {/* Auction Info - Only for Active Auctions */}
        {player.auctionStatus === "active_auction" && (
          <div className="space-y-2 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/20">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Offerta:</span>
              <span className="font-bold text-orange-600">
                {player.currentBid || 0} crediti
              </span>
            </div>

            {player.currentHighestBidderName && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Offerente:
                </span>
                <span className="text-sm font-medium text-orange-700">
                  {player.currentHighestBidderName}
                </span>
              </div>
            )}

            {player.timeRemaining && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tempo:</span>
                <span className="text-sm font-medium text-orange-600">
                  {formatTimeRemaining(player.timeRemaining)}
                </span>
              </div>
            )}

            {/* User's Auto-bid Status */}
            {player.userAutoBid && (
              <div className="border-t border-orange-200 pt-2 dark:border-orange-800">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-600">Tua auto-offerta:</span>
                  <span className="font-bold text-blue-700">
                    Max {player.userAutoBid.maxAmount}
                  </span>
                </div>
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
