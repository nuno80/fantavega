"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { AuctionPlayerCard } from "@/components/auction/AuctionPlayerCard";
import { BiddingInterface } from "@/components/auction/BiddingInterface";
import { AuctionTimer } from "@/components/auction/AuctionTimer";
import { BidHistory } from "@/components/auction/BidHistory";
import { BudgetDisplay } from "@/components/auction/BudgetDisplay";
import { AuctionLayout } from "@/components/auction/AuctionLayout";
import { ManagerColumn } from "@/components/auction/ManagerColumn";
import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/contexts/SocketContext";
import { type AuctionStatusDetails } from "@/lib/db/services/bid.service";

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

interface AutoBid {
  player_id: number;
  user_id: string;
  max_bid_amount: number;
}

export function AuctionPageContent({ userId }: AuctionPageContentProps) {
  const [currentAuction, setCurrentAuction] = useState<ActiveAuction | null>(null);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [leagueSlots, setLeagueSlots] = useState<LeagueSlots | null>(null);
  const [activeAuctions, setActiveAuctions] = useState<ActiveAuction[]>([]);
  const [autoBids, setAutoBids] = useState<AutoBid[]>([]);
  const [bidHistory, setBidHistory] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  
  const { socket, isConnected } = useSocket();
  const router = useRouter();

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
          
          // If there's a current auction, fetch bid history
          if (auction?.player_id) {
            const bidsResponse = await fetch(`/api/leagues/${league.id}/players/${auction.player_id}/bids`);
            if (bidsResponse.ok) {
              const bidsData = await bidsResponse.json();
              setBidHistory(bidsData.bids || []);
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
    socket.emit("join-league-room", `league-${selectedLeagueId}`);

    // Handle auction updates
    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
    }) => {
      if (currentAuction && data.playerId === currentAuction.player_id) {
        setCurrentAuction(prev => prev ? {
          ...prev,
          current_highest_bid_amount: data.newPrice,
          current_highest_bidder_id: data.highestBidderId,
          scheduled_end_time: data.scheduledEndTime,
        } : null);
      }
    };

    // Handle bid surpassed notifications
    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      toast.warning(`La tua offerta per ${data.playerName} è stata superata!`, {
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

    socket.on("auction-update", handleAuctionUpdate);
    socket.on("bid-surpassed-notification", handleBidSurpassed);
    socket.on("auction-closed-notification", handleAuctionClosed);

    return () => {
      socket.emit("leave-league-room", `league-${selectedLeagueId}`);
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.off("auction-closed-notification", handleAuctionClosed);
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
    router.push(`/leagues/${selectedLeagueId}/roster`);
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
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
        {/* Manager Columns */}
        <div className="flex-1 flex space-x-2 p-2">
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
                  leagueSlots={leagueSlots}
                  activeAuctions={activeAuctions}
                  autoBids={autoBids}
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

        {/* Right Sidebar - Call Player Interface */}
        <div className="flex-1 min-w-0 bg-gray-800 border-l border-gray-700 p-4">
          <CallPlayerInterface 
            leagueId={selectedLeagueId || 0}
            userId={userId}
            onStartAuction={(playerId) => {
              // Refresh the page or update state when auction starts
              window.location.reload();
            }}
          />
        </div>
    </div>
  );
}