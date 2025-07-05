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

export function AuctionPageContent({ userId }: AuctionPageContentProps) {
  const [currentAuction, setCurrentAuction] = useState<AuctionStatusDetails | null>(null);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
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
    return <div>Caricamento...</div>;
  }

  if (!currentAuction) {
    return (
      <AuctionLayout 
        leagueName={leagueInfo?.name}
        onTeamManagement={handleTeamManagement}
      >
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <h2 className="text-2xl font-bold mb-4">Nessuna Asta Attiva</h2>
          <p className="text-muted-foreground mb-6">
            Al momento non ci sono aste attive in questa lega.
          </p>
          <Button onClick={() => window.location.reload()}>
            Aggiorna Pagina
          </Button>
        </div>
      </AuctionLayout>
    );
  }

  const isUserHighestBidder = currentAuction.current_highest_bidder_id === userId;

  return (
    <AuctionLayout 
      leagueName={leagueInfo?.name}
      onTeamManagement={handleTeamManagement}
    >
      {/* Mobile Layout - Single Column */}
      <div className="lg:hidden space-y-6">
        <AuctionPlayerCard
          playerName={currentAuction.player_name || "Giocatore"}
          playerRole="A" // You'll need to get this from player data
          currentBid={currentAuction.current_highest_bid_amount}
          timeRemaining={currentAuction.time_remaining_seconds}
          status={currentAuction.status}
        />
        
        <AuctionTimer
          scheduledEndTime={currentAuction.scheduled_end_time}
          status={currentAuction.status}
        />

        {userBudget && (
          <BudgetDisplay
            totalBudget={userBudget.total_budget}
            currentBudget={userBudget.current_budget}
            lockedCredits={userBudget.locked_credits}
            teamName={userBudget.team_name}
          />
        )}

        {userBudget && leagueInfo && (
          <BiddingInterface
            currentBid={currentAuction.current_highest_bid_amount}
            minBid={leagueInfo.min_bid}
            userBudget={userBudget.current_budget}
            lockedCredits={userBudget.locked_credits}
            isUserHighestBidder={isUserHighestBidder}
            auctionStatus={currentAuction.status}
            onPlaceBid={handlePlaceBid}
          />
        )}

        <BidHistory
          bids={currentAuction.bid_history || []}
          currentUserId={userId}
        />
      </div>

      {/* Desktop Layout - Two Columns */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-6">
        {/* Left Panel - Auction Info */}
        <div className="space-y-6">
          <AuctionPlayerCard
            playerName={currentAuction.player_name || "Giocatore"}
            playerRole="A" // You'll need to get this from player data
            currentBid={currentAuction.current_highest_bid_amount}
            timeRemaining={currentAuction.time_remaining_seconds}
            status={currentAuction.status}
          />
          
          <AuctionTimer
            scheduledEndTime={currentAuction.scheduled_end_time}
            status={currentAuction.status}
          />

          <BidHistory
            bids={currentAuction.bid_history || []}
            currentUserId={userId}
          />
        </div>

        {/* Right Panel - Bidding & Budget */}
        <div className="space-y-6">
          {userBudget && (
            <BudgetDisplay
              totalBudget={userBudget.total_budget}
              currentBudget={userBudget.current_budget}
              lockedCredits={userBudget.locked_credits}
              teamName={userBudget.team_name}
            />
          )}

          {userBudget && leagueInfo && (
            <BiddingInterface
              currentBid={currentAuction.current_highest_bid_amount}
              minBid={leagueInfo.min_bid}
              userBudget={userBudget.current_budget}
              lockedCredits={userBudget.locked_credits}
              isUserHighestBidder={isUserHighestBidder}
              auctionStatus={currentAuction.status}
              onPlaceBid={handlePlaceBid}
            />
          )}

          {/* Current Bidder Info */}
          {currentAuction.current_highest_bidder_id && (
            <Card>
              <CardHeader>
                <CardTitle>Miglior Offerente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span>{currentAuction.current_highest_bidder_username || currentAuction.current_highest_bidder_id}</span>
                  {isUserHighestBidder && (
                    <Badge className="bg-green-500">Sei tu!</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuctionLayout>
  );
}