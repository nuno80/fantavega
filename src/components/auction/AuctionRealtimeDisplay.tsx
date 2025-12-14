// src/components/auction/AuctionRealtimeDisplay.tsx v.2.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

"use client";

import { useEffect, useState } from "react";

import { useSocket } from "@/contexts/SocketContext";
import { type AuctionStatusDetails } from "@/lib/db/services/bid.service";
import {
  getFantacalcioImageUrl,
  getPlayerImageUrl,
  getTeamLogoUrl,
} from "@/lib/utils";
import { toast } from "sonner";

// src/components/auction/AuctionRealtimeDisplay.tsx v.2.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// Props del componente
interface AuctionDisplayProps {
  initialAuctionData: AuctionStatusDetails;
  leagueId: string;
  playerId: number;
}

// Componente principale
export function AuctionRealtimeDisplay({
  initialAuctionData,
  leagueId,
  playerId,
}: AuctionDisplayProps) {
  // Stato del componente
  const [auctionData, setAuctionData] = useState(initialAuctionData);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const { socket, isConnected } = useSocket();

  // CRITICAL FIX: Synchronize internal state when props change
  useEffect(() => {
    setAuctionData(initialAuctionData);
    console.log("[AuctionRealtimeDisplay] Updated auction data from props:", {
      playerId: initialAuctionData.player_id,
      currentBid: initialAuctionData.current_highest_bid_amount,
      bidder: initialAuctionData.current_highest_bidder_id,
    });
  }, [initialAuctionData]);

  // Socket.IO event listeners for real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !leagueId) {
      console.log("[AuctionRealtimeDisplay] Socket not ready:", {
        isConnected,
        hasSocket: !!socket,
        leagueId,
      });
      return;
    }

    console.log(
      `[AuctionRealtimeDisplay] Setting up Socket.IO listeners for player ${playerId}`
    );

    // Handle auction updates specifically for this player
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      if (data.playerId === playerId) {
        console.log(
          "[AuctionRealtimeDisplay] Received auction update for this player:",
          data
        );

        setAuctionData((prev) => ({
          ...prev,
          current_highest_bid_amount: data.newPrice,
          current_highest_bidder_id: data.highestBidderId,
          scheduled_end_time: data.scheduledEndTime,
        }));

        // Trigger highlighting effect
        setIsHighlighted(true);
        setTimeout(() => setIsHighlighted(false), 2000);
      }
    };

    // Handle auction closure
    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      if (data.playerId === playerId) {
        console.log(
          "[AuctionRealtimeDisplay] Auction closed for this player:",
          data
        );

        setAuctionData((prev) => ({
          ...prev,
          status: "sold",
          current_highest_bid_amount: data.finalPrice,
          current_highest_bidder_id: data.winnerId,
        }));

        toast.success(`Asta conclusa per ${data.playerName}!`, {
          description: `Venduto a ${data.winnerId} per ${data.finalPrice} crediti.`,
        });
      }
    };

    // Register event listeners
    socket.on("auction-update", handleAuctionUpdate);
    socket.on("auction-closed-notification", handleAuctionClosed);

    // Cleanup
    return () => {
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("auction-closed-notification", handleAuctionClosed);
      console.log("[AuctionRealtimeDisplay] Cleaned up Socket.IO listeners");
    };
  }, [socket, isConnected, leagueId, playerId]);

  // 6. JSX per la visualizzazione
  return (
    <div className="rounded-xl border bg-card p-6 shadow-lg transition-all duration-300 hover:shadow-xl dark:bg-card/80 dark:backdrop-blur-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {auctionData.player?.photo_url || auctionData.player?.id ? (
            <div className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-primary/20 shadow-lg bg-muted">
              <img
                src={getPlayerImageUrl(
                  auctionData.player?.id,
                  auctionData.player?.photo_url,
                  auctionData.player_name || "",
                  auctionData.player?.team || ""
                )}
                alt={auctionData.player_name || "Player"}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  const cleanUrl = (url: string) => url?.split("?")[0]?.split("#")[0];

                  const fantaUrl =
                    auctionData.player?.id &&
                    getFantacalcioImageUrl(auctionData.player.id);
                  const teamLogo = getTeamLogoUrl(
                    auctionData.player?.team || ""
                  );

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
                    target.className = "h-full w-full object-contain p-4";
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
              <div className="hidden absolute inset-0 flex items-center justify-center">
                <span className="text-6xl">⚽</span>
              </div>
            </div>
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-full bg-muted border-4 border-muted-foreground/10">
              <span className="text-6xl">⚽</span>
            </div>
          )}
          <h2 className="text-4xl font-bold tracking-tight">
            Asta per <span className="text-primary">{auctionData.player_name}</span>
          </h2>
        </div>
        {auctionData.status === "active" && (
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
          </span>
        )}
      </div>

      {auctionData.status === "active" ? (
        <div className="space-y-6">
          {/* Price Display */}
          <div
            key={auctionData.current_highest_bid_amount} // Trigger animation on change
            className={`rounded-lg border p-4 text-center transition-all duration-300 ${isHighlighted
              ? "scale-105 border-green-500 bg-green-50 dark:bg-green-900/20"
              : "bg-muted/50"
              }`}
          >
            <p className="mb-1 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Offerta Attuale
            </p>
            <p className="text-4xl font-extrabold tracking-tight text-foreground animate-in zoom-in-50 duration-300">
              {auctionData.current_highest_bid_amount} <span className="text-lg font-normal text-muted-foreground">crediti</span>
            </p>
          </div>

          {/* Bidder Info */}
          <div className="flex items-center justify-between rounded-md bg-muted/30 p-3">
            <span className="text-sm font-medium text-muted-foreground">Miglior Offerente</span>
            <span className="font-semibold text-primary">
              {auctionData.current_highest_bidder_id || "Nessuna offerta"}
            </span>
          </div>

          {/* Timer */}
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Scadenza</span>
              <span className="font-mono font-medium">
                {new Date(auctionData.scheduled_end_time * 1000).toLocaleTimeString("it-IT")}
              </span>
            </div>
            {/* Simple progress bar visual could go here if we had the start time,
                but for now we just show the time clearly */}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50/50 p-6 text-center dark:border-yellow-600 dark:bg-yellow-900/10">
          <div className="mb-2 flex justify-center">
            <div className="rounded-full bg-yellow-100 p-3 dark:bg-yellow-900/30">
              <span className="text-2xl">🏆</span>
            </div>
          </div>
          <h3 className="mb-1 text-xl font-bold text-yellow-700 dark:text-yellow-400">
            Asta Conclusa
          </h3>
          <p className="text-muted-foreground">
            Venduto a <span className="font-semibold text-foreground">{auctionData.current_highest_bidder_id}</span>
          </p>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {auctionData.current_highest_bid_amount} <span className="text-sm font-normal text-muted-foreground">crediti</span>
          </p>
        </div>
      )}
    </div>
  );
}
