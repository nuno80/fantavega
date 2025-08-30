"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useLeague } from "@/hooks/useLeague";

import { toast } from "sonner";

import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { MemoizedManagerColumn as ManagerColumn } from "@/components/auction/ManagerColumn";
import { TeamSelectorModal } from "@/components/auction/TeamSelectorModal";
import { SocketDebugger } from "@/components/debug/SocketDebugger";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import { useMobile } from "@/hooks/use-mobile";

// All interface definitions are correct and don't need changes
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
  total_penalties: number;
  firstName?: string;
  lastName?: string;
  players: PlayerInRoster[];
}

interface UserAuctionState {
  auction_id: number;
  player_id: number;
  player_name: string;
  current_bid: number;
  user_state: "miglior_offerta" | "rilancio_possibile" | "asta_abbandonata";
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

interface AutoBid {
  player_id: number;
  max_amount: number;
  is_active: boolean;
  user_id: string;
}

interface ComplianceStatus {
  user_id: string;
  compliance_timer_start_at: number | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const [userAuctionStates, setUserAuctionStates] = useState<UserAuctionState[]>([]);
  const [complianceData, setComplianceData] = useState<ComplianceStatus[]>([]);
  const [isTeamSelectorOpen, setIsTeamSelectorOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [userComplianceStatus, setUserComplianceStatus] = useState({ isCompliant: true, isInGracePeriod: true });
  const isMobile = useMobile();

  const { socket, isConnected } = useSocket();
  const router = useRouter();

  // Use the new league hook for league management
  const { leagues, selectedLeagueId, currentLeague } = useLeague();

  const fetchManagersData = useCallback(async (leagueId: number) => {
    try {
      const url = `/api/leagues/${leagueId}/managers?_t=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setManagers(data.managers || []);
        setLeagueSlots(data.leagueSlots || null);
        setActiveAuctions(data.activeAuctions || []);
        setAutoBids(data.autoBids || []);
      }
    } catch (e) {
      console.error("Error fetching managers data:", e);
    }
  }, []);

  const fetchCurrentAuction = useCallback(async (leagueId: number) => {
    try {
      const url = `/api/leagues/${leagueId}/current-auction?_t=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) {
        const auction = await res.json();
        setCurrentAuction(auction);
      }
    } catch (e) {
      console.error("Error fetching current auction:", e);
    }
  }, []);

  // Effect for initial data load and re-fetching when league changes
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!selectedLeagueId) return;
      setIsLoading(true);
      try {
        await Promise.all([
          fetchManagersData(selectedLeagueId),
          fetchCurrentAuction(selectedLeagueId),
          // Other initial fetches can go here
        ]);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        toast.error("Errore nel caricamento dei dati della lega.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [selectedLeagueId, fetchManagersData, fetchCurrentAuction]);


  // Effect for handling socket events
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    socket.emit("join-league-room", selectedLeagueId.toString());

    const handleAuctionCreated = (data: any) => {
      console.log("Socket event: auction-created", data);
      toast.info(`Nuova asta: ${data.playerName}`);
      fetchCurrentAuction(selectedLeagueId);
      fetchManagersData(selectedLeagueId);
    };

    const handleAuctionUpdate = (data: any) => {
      console.log("Socket event: auction-update", data);
      // This is the robust fix: re-fetch all relevant data
      fetchManagersData(selectedLeagueId);
      fetchCurrentAuction(selectedLeagueId);
    };

    const handleBidSurpassed = (data: { playerName: string; newBidAmount: number; }) => {
      toast.warning(`La tua offerta per ${data.playerName} è stata superata!`, {
        description: `Nuova offerta: ${data.newBidAmount} crediti.`,
      });
    };

    socket.on("auction-created", handleAuctionCreated);
    socket.on("auction-update", handleAuctionUpdate);
    socket.on("bid-surpassed-notification", handleBidSurpassed);

    return () => {
      socket.off("auction-created", handleAuctionCreated);
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.emit("leave-league-room", selectedLeagueId.toString());
    };
  }, [socket, isConnected, selectedLeagueId, fetchManagersData, fetchCurrentAuction]);

  // The rest of the component logic for handlePlaceBid, etc. remains largely the same
  // but would now use the state that is reliably updated by the socket events.

  const handlePlaceBid = async (
    amount: number,
    bidType: "manual" | "quick" = "manual",
    targetPlayerId?: number,
    bypassComplianceCheck = false,
    maxAmount?: number
  ) => {
    const playerId = targetPlayerId || currentAuction?.player_id;
    if (!playerId || !selectedLeagueId) {
      toast.error("Impossibile piazzare l'offerta: dati mancanti.");
      return;
    }

    try {
      const response = await fetch(
        `/api/leagues/${selectedLeagueId}/players/${playerId}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, bid_type: bidType, max_amount: maxAmount }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Errore nel piazzare l'offerta");
      }

      toast.success("Offerta piazzata con successo!");
      // UI update is now handled by the socket listener
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error("Errore offerta", { description: errorMessage });
    }
  };

  if (isLoading) {
    return <div>Caricamento...</div>;
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex-shrink-0 border-b border-border bg-card p-4">
        <CallPlayerInterface
          leagueId={selectedLeagueId || 0}
          userId={userId}
          onStartAuction={(playerId) => {
            console.log(`Auction started for player ${playerId}. UI will update via socket.`);
          }}
        />
      </div>

      <div className="scrollbar-hide flex flex-1 flex-col overflow-x-auto p-2 md:flex-row md:space-x-2">
        {managers.length > 0 ? (
          managers.map((manager, index) => (
            <div key={manager.user_id} className="min-w-0 flex-1">
              <ManagerColumn
                manager={manager}
                isCurrentUser={manager.user_id === userId}
                isHighestBidder={currentAuction?.current_highest_bidder_id === manager.user_id}
                position={index + 1}
                leagueSlots={leagueSlots ?? undefined}
                activeAuctions={activeAuctions}
                autoBids={autoBids}
                currentAuctionPlayerId={currentAuction?.player_id}
                userAuctionStates={userAuctionStates.filter(s => s.user_id === manager.user_id)}
                leagueId={selectedLeagueId ?? undefined}
                handlePlaceBid={handlePlaceBid}
                // Pass other necessary props
              />
            </div>
          ))
        ) : (
          <div>Nessun manager trovato.</div>
        )}
      </div>
      
      {selectedLeagueId && <SocketDebugger leagueId={selectedLeagueId} />}
    </div>
  );
}
