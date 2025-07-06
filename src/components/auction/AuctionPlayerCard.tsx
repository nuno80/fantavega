"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface AuctionPlayerCardProps {
  playerName: string;
  playerRole: string;
  playerTeam?: string;
  playerImage?: string;
  currentBid: number;
  timeRemaining?: number;
  status: string;
}

export function AuctionPlayerCard({
  playerName,
  playerRole,
  playerTeam,
  playerImage,
  currentBid,
  timeRemaining,
  status,
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
            <div className="h-24 w-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
              {playerImage ? (
                <img
                  src={playerImage}
                  alt={playerName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-gray-500">
                  {playerName?.charAt(0) || "?"}
                </span>
              )}
            </div>
            {/* Role Badge */}
            <Badge
              className={`absolute -top-1 -right-1 ${getRoleBadgeColor(playerRole)}`}
            >
              {playerRole}
            </Badge>
          </div>

          {/* Player Info */}
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold">{playerName || "Giocatore"}</h3>
            {playerTeam && (
              <p className="text-sm text-muted-foreground">{playerTeam}</p>
            )}
          </div>

          {/* Current Bid */}
          <div className="text-center space-y-1">
            <p className="text-sm text-muted-foreground">Offerta Attuale</p>
            <p className="text-3xl font-bold text-primary">
              {currentBid} <span className="text-lg">crediti</span>
            </p>
          </div>

          {/* Timer */}
          {status === "active" && (
            <div className="text-center space-y-1">
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