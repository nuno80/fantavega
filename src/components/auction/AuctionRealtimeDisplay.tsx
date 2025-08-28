// src/components/auction/AuctionRealtimeDisplay.tsx v.2.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSocket } from "@/contexts/SocketContext";
import { type AuctionStatusDetails } from "@/lib/db/services/bid.service";

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
      bidder: initialAuctionData.current_highest_bidder_id
    });
  }, [initialAuctionData]);

  // Socket.IO event listeners for real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !leagueId) {
      console.log("[AuctionRealtimeDisplay] Socket not ready:", {
        isConnected,
        hasSocket: !!socket,
        leagueId
      });
      return;
    }

    console.log(`[AuctionRealtimeDisplay] Setting up Socket.IO listeners for player ${playerId}`);

    // Handle auction updates specifically for this player
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      if (data.playerId === playerId) {
        console.log("[AuctionRealtimeDisplay] Received auction update for this player:", data);
        
        setAuctionData(prev => ({
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
        console.log("[AuctionRealtimeDisplay] Auction closed for this player:", data);
        
        setAuctionData(prev => ({
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
    <div className="rounded-lg border p-6 shadow-md">
      <h2 className="mb-4 text-2xl font-bold">
        Asta per {auctionData.player_name}
      </h2>
      {auctionData.status === "active" ? (
        <div className="space-y-3">
          <div
            className={`rounded-md p-3 transition-colors duration-500 ${isHighlighted ? "bg-green-100 dark:bg-green-900" : ""}`}
          >
            <p className="text-sm text-muted-foreground">Offerta Attuale</p>
            <p className="text-3xl font-semibold">
              {auctionData.current_highest_bid_amount} crediti
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Miglior Offerente</p>
            <p className="text-lg">{auctionData.current_highest_bidder_id}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Scadenza</p>
            <p className="text-lg">
              {new Date(auctionData.scheduled_end_time * 1000).toLocaleString(
                "it-IT"
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-gray-100 p-4 text-center dark:bg-gray-800">
          <p className="text-xl font-semibold">Asta Conclusa</p>
          <p>
            Stato: <span className="font-bold">{auctionData.status}</span>
          </p>
        </div>
      )}
    </div>
  );
}
