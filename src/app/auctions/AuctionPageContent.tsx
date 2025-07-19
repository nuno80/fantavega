"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { AuctionPlayerCard } from "@/components/auction/AuctionPlayerCard";
import { BiddingInterface } from "@/components/auction/BiddingInterface";
import { AuctionTimer } from "@/components/auction/AuctionTimer";
import { BidHistory } from "@/components/auction/BidHistory";
import { BudgetDisplayWithCompliance } from "@/components/auction/BudgetDisplay";
import { AuctionLayout } from "@/components/auction/AuctionLayout";
import { ManagerColumn } from "@/components/auction/ManagerColumn";
import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/contexts/SocketContext";
import { type AuctionStatusDetails } from "@/lib/db/services/bid.service";
import { getUserActiveResponseTimers } from "@/lib/db/services/response-timer.service";

interface AuctionPageContentProps {
  userId: string;
}

interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  team_name?: string;
  total_budget: number;
}

interface LeagueInfo {
  id: number;
  name: string;
  min_bid: number;
  status: string;
}

interface Manager {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
  firstName?: string;
  lastName?: string;
  players: PlayerInRoster[];
}

interface UserAuctionState {
  auction_id: number;
  player_id: number;
  player_name: string;
  current_bid: number;
  user_state: 'miglior_offerta' | 'rilancio_possibile' | 'asta_abbandonata';
  response_deadline: number | null;
  time_remaining: number | null;
  is_highest_bidder: boolean;
}

interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
}

interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

interface ActiveAuction {
  player_id: number;
  player_name: string;
  player_role: string;
  player_team: string;
  current_highest_bidder_id: string | null;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
  status: string;
  min_bid?: number;
  time_remaining?: number;
  player_value?: number;
}

interface AutoBidIndicator {
  player_id: number;
  auto_bid_count: number;
}

export function AuctionPageContent({ userId }: AuctionPageContentProps) {
  const [currentAuction, setCurrentAuction] = useState<ActiveAuction | null>(null);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [leagueSlots, setLeagueSlots] = useState<LeagueSlots | null>(null);
  const [activeAuctions, setActiveAuctions] = useState<ActiveAuction[]>([]);
  const [autoBids, setAutoBids] = useState<AutoBidIndicator[]>([]);
  const [bidHistory, setBidHistory] = useState<Array<{id: number; amount: number; user_id: string; created_at: string; [key: string]: unknown}>>([]);
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [userAutoBid, setUserAutoBid] = useState<{max_amount: number, is_active: boolean} | null>(null);
  const [userAuctionStates, setUserAuctionStates] = useState<UserAuctionState[]>([]);
  
  const { socket, isConnected } = useSocket();
  const router = useRouter();

  const fetchLeagueData = useCallback(async (leagueId: number) => {
    console.log(`[DATA_FETCH] Fetching all data for league ${leagueId}`);
    try {
      // Fetch all data in parallel for speed
      const [managersResponse, auctionStatesResponse, budgetResponse, auctionResponse] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/managers`),
        fetch(`/api/user/auction-states?leagueId=${leagueId}`),
        fetch(`/api/leagues/${leagueId}/budget`),
        fetch(`/api/leagues/${leagueId}/current-auction`)
      ]);

      // Process responses
      if (managersResponse.ok) {
        const managersData = await managersResponse.json();
        setManagers(managersData.managers || []);
        setLeagueSlots(managersData.leagueSlots || null);
        setActiveAuctions(managersData.activeAuctions || []);
        setAutoBids(managersData.autoBids || []);
      } else {
        console.error("Failed to fetch managers data");
      }

      if (auctionStatesResponse.ok) {
        const statesData = await auctionStatesResponse.json();
        setUserAuctionStates(statesData.states || []);
      } else {
        console.error("Failed to fetch auction states");
      }

      if (budgetResponse.ok) {
        const budget = await budgetResponse.json();
        setUserBudget(budget);
      } else {
        console.error("Failed to fetch budget data");
      }

      if (auctionResponse.ok) {
        const auction = await auctionResponse.json();
        setCurrentAuction(auction);
        
        // If there's an auction, get its specific data
        if (auction?.player_id) {
          const [bidsResponse, autoBidResponse] = await Promise.all([
            fetch(`/api/leagues/${leagueId}/players/${auction.player_id}/bids`),
            fetch(`/api/leagues/${leagueId}/players/${auction.player_id}/auto-bid`)
          ]);

          if (bidsResponse.ok) {
            const bidsData = await bidsResponse.json();
            setBidHistory(bidsData.bids || []);
          }
          if (autoBidResponse.ok) {
            const autoBidData = await autoBidResponse.json();
            setUserAutoBid(autoBidData.auto_bid);
          }
        } else {
          // No active auction, clear specific data
          setBidHistory([]);
          setUserAutoBid(null);
        }
      } else {
         console.error("Failed to fetch current auction data");
      }

    } catch (error) {
      console.error("Error fetching league data:", error);
      toast.error("Errore nell'aggiornamento dei dati della lega");
    }
  }, []); // useCallback with empty dependency array

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

  // Fetch user's leagues and then the data for the selected league
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const leaguesResponse = await fetch("/api/user/leagues");
        if (!leaguesResponse.ok) throw new Error("Failed to fetch leagues");
        
        const leaguesData = await leaguesResponse.json();
        if (leaguesData.length === 0) {
          toast.error("Non sei iscritto a nessuna lega");
          setIsLoading(false);
          return;
        }

        const league = leaguesData[0];
        setSelectedLeagueId(league.id);
        setLeagueInfo(league);
        setLeagues(leaguesData);

        // Now fetch all data for the selected league
        await fetchLeagueData(league.id);

      } catch (error) {
        console.error("Error fetching initial data:", error);
        toast.error("Errore nel caricamento dei dati iniziali");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [userId, fetchLeagueData]);

  // Socket.IO real-time updates
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    // Join league room
    socket.emit("join-league-room", selectedLeagueId.toString());

    // Auto-process expired auctions every 30 seconds
    const processExpiredAuctions = async () => {
      try {
        const response = await fetch(`/api/leagues/${selectedLeagueId}/process-expired-auctions`, {
          method: "POST",
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.processedCount > 0) {
            console.log(`Processed ${result.processedCount} expired auctions`);
            // Refresh current auction data
            const auctionResponse = await fetch(`/api/leagues/${selectedLeagueId}/current-auction`);
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

    // Handle auction updates by refetching all data
    const handleAuctionUpdate = (data: { playerId: number }) => {
      console.log(`[SOCKET] Received auction-update for player ${data.playerId}. Refetching data.`);
      if (selectedLeagueId) {
        fetchLeagueData(selectedLeagueId);
      }
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

    // Handle auction closed by refetching all data
    const handleAuctionClosed = (data: {
      playerId: number;
      playerName: string;
      winnerId: string;
      finalPrice: number;
    }) => {
      console.log(`[SOCKET] Received auction-closed-notification for player ${data.playerId}. Refetching data.`);
      toast.info(`Asta per ${data.playerName} conclusa!`, {
        description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
      });
      if (selectedLeagueId) {
        fetchLeagueData(selectedLeagueId);
      }
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
      
      // Refresh all league data
      if (selectedLeagueId) {
        fetchLeagueData(selectedLeagueId);
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
  }, [socket, isConnected, selectedLeagueId, fetchLeagueData]);

  // Helper function to refresh current auction data
  const refreshCurrentAuctionData = async () => {
    if (!selectedLeagueId) return;
    
    try {
      const auctionResponse = await fetch(`/api/leagues/${selectedLeagueId}/current-auction`);
      if (auctionResponse.ok) {
        const auction = await auctionResponse.json();
        setCurrentAuction(auction);
        
        // Also refresh bid history if there's an active auction
        if (auction?.player_id) {
          const bidsResponse = await fetch(`/api/leagues/${selectedLeagueId}/players/${auction.player_id}/bids`);
          if (bidsResponse.ok) {
            const bidsData = await bidsResponse.json();
            setBidHistory(bidsData.bids || []);
          }
        }
      }
    } catch (error) {
      console.error("Error refreshing auction data:", error);
    }
  };

  const handlePlaceBid = async (amount: number, bidType: "manual" | "quick" = "manual") => {
    if (!currentAuction || !selectedLeagueId) return;

    try {
      const response = await fetch(
        `/api/leagues/${selectedLeagueId}/players/${currentAuction.player_id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amount, bid_type: bidType }),
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
        setUserBudget(budget);
      }

      // The socket event will trigger a full data refresh, so no need to manually refresh here.
      // This prevents race conditions and ensures a single source of truth for UI updates.

    } catch (error) {
      // Even if bid fails, refresh all data to ensure UI is in sync with the server state
      if (selectedLeagueId) {
        await fetchLeagueData(selectedLeagueId);
      }
      throw error; // Re-throw to be handled by BiddingInterface
    }
  };

  const handleTeamManagement = () => {
    if (!selectedLeagueId) return;
    router.push(`/leagues/${selectedLeagueId}/roster` as Route);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-xl">Caricamento...</div>
    </div>;
  }

  console.log("Checking managers:", managers.length, "selectedLeagueId:", selectedLeagueId);
  
  const isUserHighestBidder = currentAuction?.current_highest_bidder_id === userId;

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
                  userAuctionStates={manager.user_id === userId ? userAuctionStates : []}
                  leagueId={selectedLeagueId ?? undefined}
                  handlePlaceBid={handlePlaceBid}
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
