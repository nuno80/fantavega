"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { ManagerColumn } from "@/components/auction/ManagerColumn";
import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import type { BidRecord } from "@/lib/db/services/bid.service";
import { useAuctionReducer } from "@/hooks/useAuctionReducer";
import type { 
  UserBudgetInfo, 
  LeagueInfo, 
  Manager, 
  UserAuctionState, 
  PlayerInRoster, 
  LeagueSlots, 
  ActiveAuction, 
  AutoBidIndicator 
} from "@/hooks/useAuctionReducer";

// Define the type for the initial data passed from the server component
export type InitialAuctionData = {
  leagues: LeagueInfo[];
  leagueInfo: LeagueInfo;
  managers: Manager[];
  leagueSlots: LeagueSlots | null;
  activeAuctions: ActiveAuction[];
  autoBids: AutoBidIndicator[];
  userAuctionStates: UserAuctionState[];
  userBudget: UserBudgetInfo | null;
  currentAuction: ActiveAuction | null;
  bidHistory: BidRecord[];
  userAutoBid: { max_amount: number; is_active: boolean } | null;
};

interface AuctionPageContentProps {
  userId: string;
  initialData: InitialAuctionData;
}

// Le interfacce sono ora importate da useAuctionReducer

export function AuctionPageContent({ userId, initialData }: AuctionPageContentProps) {
  // Utilizzo del nuovo hook con useReducer per gestione stato ottimizzata
  const { 
    state, 
    dispatch, 
    sortedManagers, 
    leagueStats, 
    currentPlayerAuctions, 
    currentPlayerAutoBids 
  } = useAuctionReducer(initialData);

  // Destrutturazione dello stato per compatibilita con il codice esistente
  const {
    currentAuction,
    userBudget,
    leagueInfo,
    managers,
    leagueSlots,
    activeAuctions,
    autoBids,
    bidHistory,
    leagues,
    showLeagueSelector,
    isLoading,
    selectedLeagueId,
    userAutoBid,
    userAuctionStates,
  } = state;
  
  const { socket, isConnected } = useSocket();
  const router = useRouter();

  // Helper functions for data fetching - ora utilizzano dispatch
  const fetchBudgetData = async (leagueId: number) => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/budget`);
      if (response.ok) {
        const budgetData = await response.json();
        dispatch({ type: 'SET_USER_BUDGET', payload: budgetData });
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
        dispatch({ type: 'SET_CURRENT_AUCTION', payload: auction });
      }
    } catch (error) {
      console.error("Error fetching current auction:", error);
    }
  };

  // Socket.IO real-time updates - ora utilizzano dispatch
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    // Join league room
    socket.emit("join-league-room", selectedLeagueId.toString());

    // Handle auction updates
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      console.log("[AUCTION UPDATE] Received auction update:", data);
      console.log("[AUCTION UPDATE] Current auction:", currentAuction);
      
      // Utilizzo del dispatch per aggiornare lo stato
      dispatch({ 
        type: 'UPDATE_AUCTION_BID', 
        payload: {
          playerId: data.playerId,
          newPrice: data.newPrice,
          highestBidderId: data.highestBidderId,
          scheduledEndTime: data.scheduledEndTime
        }
      });
    };

    // Handle bid surpassed notifications
    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      toast.warning(`La tua offerta per ${data.playerName} e stata superata!`, {
        description: `Nuova offerta: ${data.newBidAmount} crediti.`,
      });
    };

    // Handle auction closed
    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      dispatch({ type: 'CLOSE_AUCTION', payload: { playerId: data.playerId } });
      toast.info(`Asta per ${data.playerName} conclusa!`, {
        description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
      });
    };

    // Handle penalty notifications
    const handlePenaltyApplied = (data: {
      amount: number;
      reason: string;
    }) => {
      toast.error(`Penalita applicata: ${data.amount} crediti`, {
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
    };
  }, [socket, isConnected, selectedLeagueId, currentAuction, dispatch]);

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
      const budgetResponse = await fetch(`/api/leagues/${selectedLeagueId}/budget`);
      if (budgetResponse.ok) {
        const budget = await budgetResponse.json();
        dispatch({ type: 'SET_USER_BUDGET', payload: budget });
      }

    } catch (error) {
      throw error; // Re-throw to be handled by BiddingInterface
    }
  };

  const handleTeamManagement = () => {
    if (!selectedLeagueId) return;
    router.push(`/leagues/${selectedLeagueId}/roster` as Route);
  };

  // Calcoli memoizzati per ottimizzare le performance
  const memoizedManagerData = useMemo(() => {
    return managers.map((manager, index) => ({
      manager,
      isCurrentUser: manager.user_id === userId,
      isHighestBidder: currentAuction?.current_highest_bidder_id === manager.user_id,
      position: index + 1,
    }));
  }, [managers, userId, currentAuction]);

  const isUserHighestBidder = useMemo(() => {
    return currentAuction?.current_highest_bidder_id === userId;
  }, [currentAuction, userId]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-xl">Caricamento...</div>
    </div>;
  }

  console.log("Checking managers:", managers.length, "selectedLeagueId:", selectedLeagueId);
  console.log("League stats:", leagueStats);

  // Vista Multi-Manager - Layout a colonne ottimizzato
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Top Panel - Call Player Interface */}
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 p-4">
          <CallPlayerInterface 
            leagueId={selectedLeagueId || 0}
            userId={userId}
            onStartAuction={(playerId) => {
              // Refresh current auction instead of full page reload
              if (selectedLeagueId) {
                fetchCurrentAuction(selectedLeagueId);
              }
            }}
          />
        </div>

        {/* Bottom Panel - Manager Columns */}
        <div className="flex-1 flex space-x-2 p-2 overflow-x-auto scrollbar-hide min-h-0">
          {memoizedManagerData.length > 0 ? (
            memoizedManagerData.map(({ manager, isCurrentUser, isHighestBidder, position }) => (
              <div key={manager.user_id} className="flex-1 min-w-0">
                <ManagerColumn
                  manager={manager}
                  isCurrentUser={isCurrentUser}
                  isHighestBidder={isHighestBidder}
                  position={position}
                  leagueSlots={leagueSlots ?? undefined}
                  activeAuctions={activeAuctions}
                  autoBids={autoBids}
                  userAutoBid={isCurrentUser ? userAutoBid : null}
                  currentAuctionPlayerId={currentAuction?.player_id}
                  userAuctionStates={isCurrentUser ? userAuctionStates : []}
                  leagueId={selectedLeagueId ?? undefined}
                />
              </div>
            ))
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <h3 className="text-lg font-semibold mb-2">Nessun Manager Trovato</h3>
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