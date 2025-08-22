// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni
"use client";

// Importiamo il tipo
import { useEffect, useState } from "react";

import { toast } from "sonner";

import { useSocket } from "@/contexts/SocketContext";
import { type AuctionStatusDetails } from "@/lib/db/services/bid.service";

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// src/components/auction/AuctionRealtimeDisplay.tsx v.1.0
// Componente client che visualizza e aggiorna in tempo reale i dati di un'asta.

// 1. Direttiva e Importazioni

// 2. Props del componente
interface AuctionDisplayProps {
  initialAuctionData: AuctionStatusDetails;
  leagueId: string;
  playerId: number;
}

// 3. Componente principale
export function AuctionRealtimeDisplay({
  initialAuctionData,
  leagueId,
  playerId,
}: AuctionDisplayProps) {
  // 4. Stato del componente
  const [auctionData, setAuctionData] = useState(initialAuctionData);
  const [isHighlighted, setIsHighlighted] = useState(false); // Per l'effetto visivo
  const { socket, isConnected } = useSocket();

  // 5. Effetto per la gestione degli eventi Socket.IO
  useEffect(() => {
    // Non fare nulla se il socket non è connesso o non esiste
    if (!isConnected || !socket) {
      return;
    }

    // --- Gestori di Eventi ---
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      // Aggiorna solo se l'evento riguarda questo specifico giocatore
      if (data.playerId === playerId) {
        console.log("[Socket Client] Ricevuto auction-update:", data);
        setAuctionData((prev) => ({
          ...prev,
          current_highest_bid_amount: data.newPrice,
          current_highest_bidder_id: data.highestBidderId,
          scheduled_end_time: data.scheduledEndTime,
        }));

        // Attiva l'effetto visivo
        setIsHighlighted(true);
        setTimeout(() => setIsHighlighted(false), 2000); // L'effetto dura 2 secondi
      }
    };

    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      console.log("[Socket Client] Ricevuto bid-surpassed-notification:", data);
      toast.warning(`La tua offerta per ${data.playerName} è stata superata!`, {
        description: `Nuova offerta: ${data.newBidAmount} crediti.`,
      });
    };

    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      if (data.playerId === playerId) {
        console.log(
          "[Socket Client] Ricevuto auction-closed-notification:",
          data
        );
        setAuctionData((prev) => ({ ...prev, status: "sold" }));
        toast.info(`Asta per ${data.playerName} conclusa!`, {
          description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
        });
      }
    };

    // --- Collegamento dei Gestori ---
    socket.on("auction-update", handleAuctionUpdate);
    socket.on("bid-surpassed-notification", handleBidSurpassed);
    socket.on("auction-closed-notification", handleAuctionClosed);

    // --- Cleanup: Rimuovi i listener ---
    return () => {
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.off("auction-closed-notification", handleAuctionClosed);
    };
  }, [socket, isConnected, leagueId, playerId]); // Manteniamo le dipendenze per coerenza

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
