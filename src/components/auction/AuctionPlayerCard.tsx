"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  getFantacalcioImageUrl,
  getPlayerImageUrl,
  getTeamLogoUrl,
} from "@/lib/utils";

interface AuctionPlayerCardProps {
  playerName: string;
  playerRole: string;
  playerTeam?: string;
  playerImage?: string;
  playerId?: number;
  currentBid: number;
  timeRemaining?: number;
  status: string;
  userAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
}

export function AuctionPlayerCard({
  playerName,
  playerRole,
  playerTeam,
  playerImage,
  playerId,
  currentBid,
  timeRemaining,
  status,
  userAutoBid,
}: AuctionPlayerCardProps) {
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

  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return "Scaduta";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Player Image */}
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              {(playerImage || playerId) && (
                <img
                  src={getPlayerImageUrl(playerId, playerImage, playerName, playerTeam)}
                  alt={playerName}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    // Helper to strip params/hashes for comparison
                    const cleanUrl = (url: string) => url?.split("?")[0]?.split("#")[0];

                    const fantaUrl =
                      playerId && getFantacalcioImageUrl(playerId);
                    const teamLogo = getTeamLogoUrl(playerTeam || "");

                    const currentSrc = cleanUrl(target.src);
                    const safeFantaUrl = fantaUrl ? cleanUrl(fantaUrl) : null;
                    const safeTeamLogo = teamLogo ? cleanUrl(teamLogo) : null;

                    if (
                      fantaUrl &&
                      currentSrc !== safeFantaUrl &&
                      target.src !== fantaUrl
                    ) {
                      target.src = fantaUrl;
                    } else if (
                      teamLogo &&
                      currentSrc !== safeTeamLogo &&
                      target.src !== teamLogo
                    ) {
                      target.src = teamLogo;
                      target.className = "h-full w-full object-contain p-2";
                      target.onerror = () => {
                        target.style.display = "none";
                        target.nextElementSibling?.classList.remove("hidden");
                      };
                    } else {
                      target.style.display = "none";
                      target.nextElementSibling?.classList.remove("hidden");
                    }
                  }}
                />
              )}
              <div
                className={`flex h-full w-full items-center justify-center bg-muted text-2xl font-bold text-gray-500 ${playerImage || playerId ? "hidden" : ""
                  }`}
              >
                {playerName?.charAt(0) || "?"}
              </div>
            </div>
            {/* Role Badge */}
            <Badge
              className={`absolute -right-1 -top-1 ${getRoleBadgeColor(playerRole)}`}
            >
              {playerRole}
            </Badge>
          </div>

          {/* Player Info */}
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-bold">{playerName || "Giocatore"}</h3>
            {playerTeam && (
              <p className="text-sm text-muted-foreground">{playerTeam}</p>
            )}
          </div>

          {/* Auto-Bid and Current Bid */}
          <div className="space-y-2 text-center">
            {userAutoBid && userAutoBid.is_active && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">La tua Auto-Bid</p>
                <p className="text-2xl font-bold text-blue-500">
                  {userAutoBid.max_amount}{" "}
                  <span className="text-sm">crediti</span>
                </p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Offerta Attuale</p>
              <p className="text-3xl font-bold text-green-600">
                {currentBid} <span className="text-lg">crediti</span>
              </p>
            </div>
          </div>

          {/* Timer */}
          {status === "active" && (
            <div className="space-y-1 text-center">
              <p className="text-sm text-muted-foreground">Tempo Rimanente</p>
              <p className="text-lg font-semibold">
                {formatTimeRemaining(timeRemaining)}
              </p>
            </div>
          )}

          {/* Status */}
          {status !== "active" && (
            <Badge variant={status === "sold" ? "default" : "secondary"}>
              {status === "sold" ? "Venduto" : status}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
