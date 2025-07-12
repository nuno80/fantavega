"use client";

import { useEffect, useState } from "react";
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
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [userAutoBid, setUserAutoBid] = useState<{max_amount: number, is_active: boolean} | null>(null);
  const [userAuctionStates, setUserAuctionStates] = useState<UserAuctionState[]>([]);
  
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

  // Fetch user's leagues and current auction
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        
        // First, get user's leagues
        const leaguesResponse = await fetch("/api/user/leagues");
        if (!leaguesResponse.ok) throw new Error("Failed to fetch leagues");
        
        const leagues = await leaguesResponse.json();
        
        if (leagues.length === 0) {
          toast.error("Non sei iscritto a nessuna lega");
          return;
        }

        // For now, use the first league (in a real app, user might select)
        const league = leagues[0];
        setSelectedLeagueId(league.id);
        setLeagueInfo(league);
        setLeagues(leagues);

        // Get ALL MANAGERS for this league - THIS IS THE KEY!
        console.log("Fetching managers for league:", league.id);
        const managersResponse = await fetch(`/api/leagues/${league.id}/managers`);
        if (managersResponse.ok) {
          const managersData = await managersResponse.json();
          console.log("Managers API response:", managersData);
          setManagers(managersData.managers || []);
          console.log("Set managers:", managersData.managers?.length);
          setLeagueSlots(managersData.leagueSlots || null);
          setActiveAuctions(managersData.activeAuctions || []);
          setAutoBids(managersData.autoBids || []);
        } else {
          console.error("Failed to fetch managers");
        }

        // Fetch user's auction states
        const auctionStatesResponse = await fetch(`/api/user/auction-states?leagueId=${league.id}`);
        if (auctionStatesResponse.ok) {
          const statesData = await auctionStatesResponse.json();
          console.log("Auction states API response:", statesData);
          setUserAuctionStates(statesData.states || []);
        }

        // Get user budget for this league
        const budgetResponse = await fetch(`/api/leagues/${league.id}/budget`);
        if (budgetResponse.ok) {
          const budget = await budgetResponse.json();
          setUserBudget(budget);
        }

        // Get current active auction for this league
        const auctionResponse = await fetch(`/api/leagues/${league.id}/current-auction`);
        if (auctionResponse.ok) {
          const auction = await auctionResponse.json();
          setCurrentAuction(auction);
          
          // If there's a current auction, fetch bid history and user's auto-bid
          if (auction?.player_id) {
            const bidsResponse = await fetch(`/api/leagues/${league.id}/players/${auction.player_id}/bids`);
            if (bidsResponse.ok) {
              const bidsData = await bidsResponse.json();
              setBidHistory(bidsData.bids || []);
            }
            
            // Fetch user's auto-bid for this player
            const autoBidResponse = await fetch(`/api/leagues/${league.id}/players/${auction.player_id}/auto-bid`);
            if (autoBidResponse.ok) {
              const autoBidData = await autoBidResponse.json();
              setUserAutoBid(autoBidData.auto_bid);
            }
          }
        }

      } catch (error) {
        console.error("Error fetching initial data:", error);
        toast.error("Errore nel caricamento dei dati");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [userId]);

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

    // Handle auction updates
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      console.log("[AUCTION UPDATE] Received auction update:", data);
      console.log("[AUCTION UPDATE] Current auction:", currentAuction);
      if (currentAuction && data.playerId === currentAuction.player_id) {
        console.log("[AUCTION UPDATE] Updating current auction for player:", data.playerId);
        setCurrentAuction(prev => prev ? {
          ...prev,
          current_highest_bid_amount: data.newPrice,
          current_highest_bidder_id: data.highestBidderId,
          scheduled_end_time: data.scheduledEndTime,
        } : null);
      } else {
        console.log("[AUCTION UPDATE] No matching current auction or different player");
      }
    };

    // Handle bid surpassed notifications
    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      toast.warning(`La tua offerta per ${data.playerName} Ã¨ stata superata!`, {
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
      if (currentAuction && data.playerId === currentAuction.player_id) {
        setCurrentAuction(prev => prev ? { ...prev, status: "sold" } : null);
        toast.info(`Asta per ${data.playerName} conclusa!`, {
          description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
        });
      }
    };

    // Handle penalty notifications
    const handlePenaltyApplied = (data: {
      amount: number;
      reason: string;
    }) => {
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
      const budgetResponse = await fetch(`/api/leagues/${selectedLeagueId}/budget`);
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
        <div className="flex-1 flex space-x-2 p-2 overflow-x-auto scrollbar-hide">
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
