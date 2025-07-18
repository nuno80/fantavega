"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { toast } from "sonner";

import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { ManagerColumn } from "@/components/auction/ManagerColumn";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import type {
  ActiveAuction,
  AutoBidIndicator,
  InitialAuctionData,
  LeagueInfo,
  LeagueSlots,
  Manager,
  UserAuctionState,
  UserBudgetInfo,
} from "@/types/auction";

interface AuctionPageContentProps {
  userId: string;
  initialData: InitialAuctionData;
}

export function AuctionPageContent({
  userId,
  initialData,
}: AuctionPageContentProps) {
  const [currentAuction, setCurrentAuction] = useState<ActiveAuction | null>(
    initialData.currentAuction
  );
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(
    initialData.userBudget
  );
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(
    initialData.leagueInfo
  );
  const [managers, setManagers] = useState<Manager[]>(initialData.managers);
  const [leagueSlots, setLeagueSlots] = useState<LeagueSlots | null>(
    initialData.leagueSlots
  );
  const [activeAuctions, setActiveAuctions] = useState<ActiveAuction[]>(
    initialData.activeAuctions
  );
  const [autoBids, setAutoBids] = useState<AutoBidIndicator[]>(
    initialData.autoBids
  );
  const [bidHistory, setBidHistory] = useState<any[]>(initialData.bidHistory);
  const [leagues, setLeagues] = useState<LeagueInfo[]>(initialData.leagues);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(
    initialData.leagueInfo.id
  );
  const [userAutoBid, setUserAutoBid] = useState<{
    max_amount: number;
    is_active: boolean;
  } | null>(initialData.userAutoBid);
  const [userAuctionStates, setUserAuctionStates] = useState<
    UserAuctionState[]
  >(initialData.userAuctionStates);

  const { socket, isConnected } = useSocket();
  const router = useRouter();

  // Helper functions for data fetching
  const fetchBudgetData = async (leagueId: number) => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/budget`);
      if (response.ok) {
        const budgetData = await response.json();
        setUserBudget(budgetData);
      }
    } catch (error) {
      console.error("Error fetching budget data:", error);
    }
  };

  const fetchCurrentAuction = async (leagueId: number) => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/current-auction`);
      if (response.ok) {
        const auction = await response.json();
        setCurrentAuction(auction);
      }
    } catch (error) {
      console.error("Error fetching current auction:", error);
    }
  };

  // Socket.IO real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    // Join league room
    socket.emit("join-league-room", selectedLeagueId.toString());

    // Auto-process expired auctions every 30 seconds
    const processExpiredAuctions = async () => {
      try {
        const response = await fetch(
          `/api/leagues/${selectedLeagueId}/process-expired-auctions`,
          {
            method: "POST",
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.processedCount > 0) {
            console.log(`Processed ${result.processedCount} expired auctions`);
            // Refresh current auction data
            const auctionResponse = await fetch(
              `/api/leagues/${selectedLeagueId}/current-auction`
            );
            if (auctionResponse.ok) {
              const auction = await auctionResponse.json();
              setCurrentAuction(auction);
            }
          }
        }
      } catch (error) {
        console.error("Error processing expired auctions:", error);
      }
    };

    // Process expired auctions immediately and then every 30 seconds
    processExpiredAuctions();
    const expiredAuctionsInterval = setInterval(processExpiredAuctions, 30000);

    // Handle auction updates
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      setActiveAuctions(prev =>
        prev.map(auction =>
          auction.player_id === data.playerId
            ? {
                ...auction,
                current_highest_bid_amount: data.newPrice,
                current_highest_bidder_id: data.highestBidderId,
                scheduled_end_time: data.scheduledEndTime,
              }
            : auction
        )
      );

      if (currentAuction && data.playerId === currentAuction.player_id) {
        setCurrentAuction(prev =>
          prev
            ? {
                ...prev,
                current_highest_bid_amount: data.newPrice,
                current_highest_bidder_id: data.highestBidderId,
                scheduled_end_time: data.scheduledEndTime,
              }
            : null
        );
      }
    };

    // Handle bid surpassed notifications
    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      toast.warning(
        `La tua offerta per ${data.playerName} Ã¨ stata superata!`,
        {
          description: `Nuova offerta: ${data.newBidAmount} crediti.`,
        }
      );
    };

    // Handle auction closed
    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      if (currentAuction && data.playerId === currentAuction.player_id) {
        setCurrentAuction((prev) =>
          prev ? { ...prev, status: "sold" } : null
        );
        toast.info(`Asta per ${data.playerName} conclusa!`, {
          description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
        });
      }
    };

    // Handle penalty notifications
    const handlePenaltyApplied = (data: { amount: number; reason: string }) => {
      toast.error(`Penalità applicata: ${data.amount} crediti`, {
        description: data.reason,
        duration: 8000, // Show longer for important penalty notifications
      });

      // Refresh budget data after penalty
      if (selectedLeagueId) {
        fetchBudgetData(selectedLeagueId);
      }
    };

    // Handle auto-bid activation notifications
    const handleAutoBidActivated = (data: {
      playerName: string;
      bidAmount: number;
      triggeredBy: string;
    }) => {
      toast.success(`Auto-bid attivata per ${data.playerName}!`, {
        description: `Offerta automatica di ${data.bidAmount} crediti piazzata.`,
        duration: 5000,
      });

      // Refresh current auction data
      if (currentAuction && selectedLeagueId) {
        fetchCurrentAuction(selectedLeagueId);
      }
    };

    socket.on("auction-update", handleAuctionUpdate);
    socket.on("bid-surpassed-notification", handleBidSurpassed);
    socket.on("auction-closed-notification", handleAuctionClosed);
    socket.on("penalty-applied-notification", handlePenaltyApplied);
    socket.on("auto-bid-activated-notification", handleAutoBidActivated);

    return () => {
      socket.emit("leave-league-room", selectedLeagueId.toString());
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.off("auction-closed-notification", handleAuctionClosed);
      socket.off("penalty-applied-notification", handlePenaltyApplied);
      socket.off("auto-bid-activated-notification", handleAutoBidActivated);
      clearInterval(expiredAuctionsInterval);
    };
  }, [socket, isConnected, selectedLeagueId, currentAuction]);

  const handlePlaceBid = async (amount: number) => {
    if (!currentAuction || !selectedLeagueId) return;

    try {
      const response = await fetch(
        `/api/leagues/${selectedLeagueId}/players/${currentAuction.player_id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bidAmount: amount }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Errore nel piazzare l'offerta");
      }

      // Update budget after successful bid
      const budgetResponse = await fetch(
        `/api/leagues/${selectedLeagueId}/budget`
      );
      if (budgetResponse.ok) {
        const budget = await budgetResponse.json();
        setUserBudget(budget);
      }
    } catch (error) {
      throw error; // Re-throw to be handled by BiddingInterface
    }
  };

  const handleTeamManagement = () => {
    if (!selectedLeagueId) return;
    router.push(`/leagues/${selectedLeagueId}/roster` as Route);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-xl">Caricamento...</div>
      </div>
    );
  }

  console.log(
    "Checking managers:",
    managers.length,
    "selectedLeagueId:",
    selectedLeagueId
  );

  const isUserHighestBidder =
    currentAuction?.current_highest_bidder_id === userId;

  // Vista Multi-Manager - Layout a colonne come nell'esempio HTML
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Top Panel - Call Player Interface */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 p-4">
        <CallPlayerInterface
          leagueId={selectedLeagueId || 0}
          userId={userId}
          onStartAuction={(playerId) => {
            // Refresh the page or update state when auction starts
            window.location.reload();
          }}
        />
      </div>

      {/* Bottom Panel - Manager Columns */}
      <div className="flex-1 flex space-x-2 p-2 overflow-x-auto scrollbar-hide min-h-0">
        {managers.length > 0 ? (
          managers.map((manager, index) => (
            <div key={manager.user_id} className="flex-1 min-w-0">
              <ManagerColumn
                manager={manager}
                isCurrentUser={manager.user_id === userId}
                isHighestBidder={
                  currentAuction?.current_highest_bidder_id === manager.user_id
                }
                position={index + 1}
                leagueSlots={leagueSlots ?? undefined}
                activeAuctions={activeAuctions}
                autoBids={autoBids}
                userAutoBid={manager.user_id === userId ? userAutoBid : null}
                currentAuctionPlayerId={currentAuction?.player_id}
                userAuctionStates={
                  manager.user_id === userId ? userAuctionStates : []
                }
                leagueId={selectedLeagueId ?? undefined}
              />
            </div>
          ))
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center text-gray-400">
              <h3 className="mb-2 text-lg font-semibold">
                Nessun Manager Trovato
              </h3>
              <p className="text-sm">
                Non sono stati trovati partecipanti per questa lega.
              </p>
              <Button
                onClick={() => window.location.reload()}
                className="mt-4"
                variant="outline"
              >
                Ricarica
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
