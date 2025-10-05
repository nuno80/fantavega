// src/app/auctions/AuctionPageContent.tsx - Patched with 8dbeada changes
"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { LeagueSelector } from "@/components/auction/LeagueSelector";
import { MemoizedManagerColumn as ManagerColumn } from "@/components/auction/ManagerColumn";
import { TeamSelectorModal } from "@/components/auction/TeamSelectorModal";
import { SocketDebugger } from "@/components/debug/SocketDebugger";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/contexts/SocketContext";
import { useMobile } from "@/hooks/use-mobile";

// src/app/auctions/AuctionPageContent.tsx - Patched with 8dbeada changes

// --- Interface Definitions ---
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
  status: string;
  min_bid?: number;
  team_name: string; // Made non-optional, assuming it's always provided or has a default
  current_budget: number; // Made non-optional
  locked_credits: number; // Made non-optional
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
  player_status: "assigned" | "winning" | "pending_decision";
  scheduled_end_time?: number | null;
  response_deadline?: number | null;
  user_auto_bid_max_amount?: number | null;
  user_auto_bid_is_active?: boolean | null;
}

interface Bid {
  id: number;
  auction_id: number;
  user_id: string;
  amount: number;
  bid_time: string;
  bid_type: "manual" | "auto" | "quick";
  bidder_username?: string;
}

interface AuctionUpdateData {
  playerId: number;
  newPrice: number;
  highestBidderId: string;
  scheduledEndTime: number;
  budgetUpdates?: {
    userId: string;
    newBudget: number;
    newLockedCredits: number;
  }[];
  userAuctionStates?: UserAuctionState[];
}

interface BidSurpassedData {
  playerName: string;
  newBidAmount: number;
}

interface AuctionClosedData {
  playerId: number;
  playerName: string;
  winnerId: string;
  finalPrice: number;
}

interface AuctionCreatedData {
  playerId: number;
  playerName: string;
  playerRole: string;
  playerTeam: string;
  highestBidderId: string | null;
  newPrice: number;
  scheduledEndTime: number;
}

interface UserAbandonedData {
  userId: string;
  playerName?: string;
  playerId: number;
}

interface PenaltyAppliedData {
  amount: number;
  reason: string;
}

interface AutoBidActivatedData {
  playerName: string;
  bidAmount: number;
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
  totalPenalties?: number; // Added
  newBudget?: number; // Added
}

export function AuctionPageContent({ userId }: AuctionPageContentProps) {
  const [currentAuction, setCurrentAuction] = useState<ActiveAuction | null>(
    null
  );
  const [_userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [_leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [leagueSlots, setLeagueSlots] = useState<LeagueSlots | null>(null);
  const [activeAuctions, setActiveAuctions] = useState<ActiveAuction[]>([]);
  const [autoBids, setAutoBids] = useState<AutoBid[]>([]);
  const [userAutoBidOverlay, setUserAutoBidOverlay] = useState<Record<number, { max_amount: number; is_active: boolean }>>({});
  const [_bidHistory, setBidHistory] = useState<Bid[]>([]);
  const [leagues, setLeagues] = useState<LeagueInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [userAuctionStates, setUserAuctionStates] = useState<
    UserAuctionState[]
  >([]);
  const [complianceData, setComplianceData] = useState<ComplianceStatus[]>([]);
  const [isTeamSelectorOpen, setIsTeamSelectorOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(
    null
  );
  const [userComplianceStatus, setUserComplianceStatus] = useState({
    isCompliant: true,
    isInGracePeriod: true,
  });
  const isMobile = useMobile();

  const { socket, isConnected } = useSocket();
  const router = useRouter();

  const fetchBudgetData = useCallback(async (leagueId: number) => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/budget`);
      if (response.ok) {
        const budgetData = await response.json();
        setUserBudget(budgetData);
      }
    } catch (error) {
      console.error("Error fetching budget data:", error);
    }
  }, []);

  const fetchCurrentAuction = useCallback(async (leagueId: number) => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/current-auction`);
      if (response.ok) {
        const auction = await response.json();
        setCurrentAuction(auction);
      }
    } catch (error) {
      console.error("Error fetching current auction:", error);
    }
  }, []);

  const fetchManagersData = useCallback(async (leagueId: number) => {
    try {
      const managersResponse = await fetch(`/api/leagues/${leagueId}/managers`);
      if (managersResponse.ok) {
        const managersData = await managersResponse.json();
        setManagers(managersData.managers || []);
        setLeagueSlots(managersData.leagueSlots || null);
        setActiveAuctions(managersData.activeAuctions || []);
        setAutoBids(managersData.autoBids || []);
      }
    } catch (error) {
      console.error("Error fetching managers data:", error);
    }
  }, []);

  const refreshUserAuctionStatesOld = useCallback(async (leagueId: number) => {
    try {
      const auctionStatesResponse = await fetch(
        `/api/user/auction-states?leagueId=${leagueId}`
      );
      if (auctionStatesResponse.ok) {
        const statesData = await auctionStatesResponse.json();
        setUserAuctionStates(statesData.states || []);
      }
    } catch (error) {
      console.error("Error refreshing user auction states:", error);
    }
  }, []);

  const fetchComplianceData = useCallback(async (leagueId: number) => {
    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/all-compliance-status`,
        {
          credentials: "include"
        }
      );
      if (response.ok) {
        const data = await response.json();
        setComplianceData(data.complianceStatus || []);
      }
    } catch (error) {
      console.error("Error fetching compliance data:", error);
    }
  }, []);

  // Add this new function to refresh all necessary data when compliance changes
  const refreshComplianceData = useCallback(async (leagueId: number) => {
    await Promise.all([
      fetchComplianceData(leagueId),
      fetchBudgetData(leagueId),
      fetchManagersData(leagueId)
    ]);
  }, [fetchComplianceData, fetchBudgetData, fetchManagersData]);

  // Add function to handle league change
  const handleLeagueChange = async (newLeagueId: number) => {
    if (newLeagueId === selectedLeagueId) return; // No change needed
    
    console.log(`[League Selector] Switching from league ${selectedLeagueId} to ${newLeagueId}`);
    
    try {
      // Update selected league
      setSelectedLeagueId(newLeagueId);
      
      // Find the league info
      const league = leagues.find(l => l.id === newLeagueId);
      if (league) {
        setLeagueInfo(league);
      }
      
      // Reset current states
      setManagers([]);
      setActiveAuctions([]);
      setAutoBids([]);
      setCurrentAuction(null);
      setUserAuctionStates([]);
      setComplianceData([]);
      setUserAutoBidOverlay({});
      
      // Fetch data for the new league
      await Promise.all([
        fetchManagersData(newLeagueId),
        fetchCurrentAuction(newLeagueId),
        fetchBudgetData(newLeagueId),
        fetchComplianceData(newLeagueId),
        refreshUserAuctionStatesOld(newLeagueId),
      ]);
      
      toast.success(`Passato alla lega: ${league?.name || newLeagueId}`);
    } catch (error) {
      console.error("Error switching league:", error);
      toast.error("Errore nel cambio lega");
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        const leaguesResponse = await fetch("/api/user/leagues");
        if (!leaguesResponse.ok) {
          if (leaguesResponse.status === 401) {
            console.log(
              "[AUTH] User not authenticated, redirecting to sign-in"
            );
            router.push("/sign-in" as Route);
            return;
          }
          throw new Error(`Failed to fetch leagues: ${leaguesResponse.status}`);
        }
        const fetchedLeagues = await leaguesResponse.json();
        if (fetchedLeagues.length === 0) {
          toast.error("Non sei iscritto a nessuna lega");
          return;
        }
        
        setLeagues(fetchedLeagues);
        
        // Try to get league from localStorage first, then fall back to first league
        let selectedLeague;
        const savedLeagueId = localStorage.getItem('selectedLeagueId');
        if (savedLeagueId) {
          selectedLeague = fetchedLeagues.find((l: any) => l.id === parseInt(savedLeagueId));
        }
        if (!selectedLeague) {
          selectedLeague = fetchedLeagues[0];
        }
        
        setSelectedLeagueId(selectedLeague.id);
        setLeagueInfo(selectedLeague);
        
        console.log(`[League Selector] Selected league: ${selectedLeague.name} (ID: ${selectedLeague.id})`);

        // Other initial fetches...
        await Promise.all([
          fetchManagersData(selectedLeague.id),
          fetchCurrentAuction(selectedLeague.id),
          fetchBudgetData(selectedLeague.id),
          fetchComplianceData(selectedLeague.id),
          refreshUserAuctionStatesOld(selectedLeague.id),
        ]);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        if (error instanceof Error && error.message.includes("401")) {
          toast.error("Devi effettuare l'accesso per visualizzare le aste");
          router.push("/sign-in" as Route);
        } else {
          toast.error("Errore nel caricamento dei dati");
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [
    userId,
    router,
    fetchManagersData,
    fetchCurrentAuction,
    fetchBudgetData,
    fetchComplianceData,
    refreshUserAuctionStatesOld,
  ]);

  // Add useEffect for processing expired auctions
  useEffect(() => {
    if (!selectedLeagueId) return;

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
            // Refresh relevant data
            fetchManagersData(selectedLeagueId);
          }
        }
      } catch (error) {
        console.error("Error processing expired auctions:", error);
      }
    };

    // Process expired auctions immediately and then every 30 seconds
    processExpiredAuctions();
    const expiredAuctionsInterval = setInterval(processExpiredAuctions, 30000);

    return () => {
      clearInterval(expiredAuctionsInterval);
    };
  }, [selectedLeagueId, fetchManagersData]);

  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) {
      console.log("[Socket Client] Socket effect skipped:", {
        isConnected,
        hasSocket: !!socket,
        selectedLeagueId,
      });
      return;
    }

    console.log(
      `[Socket Client] Joining league room: league-${selectedLeagueId}`
    );
    socket.emit("join-league-room", selectedLeagueId.toString());

    const handleAuctionUpdate = (data: AuctionUpdateData) => {
      console.log("[AUCTION UPDATE] Received auction update:", {
        playerId: data.playerId,
        newPrice: data.newPrice,
        highestBidderId: data.highestBidderId,
      });
      setCurrentAuction((prev) => {
        if (prev && data.playerId === prev.player_id) {
          return {
            ...prev,
            current_highest_bid_amount: data.newPrice,
            current_highest_bidder_id: data.highestBidderId,
            scheduled_end_time: data.scheduledEndTime,
          };
        }
        return prev;
      });
      setActiveAuctions((prevAuctions) =>
        prevAuctions.map((auction) => {
          if (auction.player_id === data.playerId) {
            console.log(
              `[AUCTION UPDATE] Updating active auction list for player ${data.playerId}`
            );
            return {
              ...auction,
              current_highest_bid_amount: data.newPrice,
              current_highest_bidder_id: data.highestBidderId,
              scheduled_end_time: data.scheduledEndTime,
            };
          }
          return auction;
        })
      );
      if (data.budgetUpdates) {
        setManagers((prevManagers) =>
          prevManagers.map((manager) => {
            const update = data.budgetUpdates?.find(
              (u: { userId: string }) => u.userId === manager.user_id
            );
            if (update) {
              return {
                ...manager,
                current_budget: update.newBudget,
                locked_credits: update.newLockedCredits,
              };
            }
            return manager;
          })
        );
      }
      if (data.userAuctionStates) {
        setUserAuctionStates(data.userAuctionStates);
      }
      // Always refresh user-specific states on auction updates to guarantee response timers appear
      if (selectedLeagueId) {
        refreshUserAuctionStatesOld(selectedLeagueId);
        // Add this line to ensure all manager data is refreshed consistently
        fetchManagersData(selectedLeagueId);
      }
    };

    const handleBidSurpassed = (data: BidSurpassedData) => {
      toast.warning(`La tua offerta per ${data.playerName} è stata superata!`, {
        description: `Nuova offerta: ${data.newBidAmount} crediti.`,
      });
      if (selectedLeagueId) {
        refreshUserAuctionStatesOld(selectedLeagueId);
      }
    };

    const handleAuctionClosed = (data: AuctionClosedData) => {
      setCurrentAuction((prev) => {
        if (prev && data.playerId === prev.player_id) {
          toast.info(`Asta per ${data.playerName} conclusa!`, {
            description: `Assegnato a ${data.winnerId} per ${data.finalPrice} crediti.`,
          });
          return null;
        }
        return prev;
      });
      setActiveAuctions((prevAuctions) =>
        prevAuctions.filter((auction) => auction.player_id !== data.playerId)
      );
      fetchManagersData(selectedLeagueId);
    };

    const handleAuctionCreated = (data: AuctionCreatedData) => {
      console.log("[Socket Client] 🎯 AUCTION-CREATED event received:", data);
      const existingAuctionInList = activeAuctions.find(
        (a) => a.player_id === data.playerId
      );
      if (existingAuctionInList) {
        console.log(
          "[Socket Client] 🚨 DUPLICATE: Auction already exists, ignoring duplicate auction-created event",
          {
            playerId: data.playerId,
          }
        );
        return;
      }
      console.log("[Socket Client] 🆕 Processing NEW auction creation");
      setActiveAuctions((prevAuctions) => {
        const newAuction: ActiveAuction = {
          player_id: data.playerId,
          player_name: data.playerName || `Player ${data.playerId}`,
          player_role: data.playerRole || "",
          player_team: data.playerTeam || "",
          current_highest_bidder_id: data.highestBidderId,
          current_highest_bid_amount: data.newPrice,
          scheduled_end_time: data.scheduledEndTime,
          status: "active",
        };
        return [...prevAuctions, newAuction];
      });
      setCurrentAuction((prev) => {
        if (!prev || data.scheduledEndTime > (prev.scheduled_end_time || 0)) {
          return {
            player_id: data.playerId,
            player_name: data.playerName || `Player ${data.playerId}`,
            player_role: data.playerRole || "",
            player_team: data.playerTeam || "",
            current_highest_bidder_id: data.highestBidderId,
            current_highest_bid_amount: data.newPrice,
            scheduled_end_time: data.scheduledEndTime,
            status: "active" as const,
          };
        }
        return prev;
      });
      toast.info(`Nuova asta iniziata!`, {
        description:
          `${data.playerName || `Player ${data.playerId}`} (${data.playerRole || "?"}) - ${data.playerTeam || "?"}`.trim(),
        duration: 4000,
      });
      if (selectedLeagueId) {
        fetchManagersData(selectedLeagueId);
      }
    };

    const handleUserAbandoned = (data: UserAbandonedData) => {
      console.log("[Socket Client] User abandoned auction:", data);
      refreshUserAuctionStatesOld(selectedLeagueId);
      fetchManagersData(selectedLeagueId);
      if (data.userId !== userId) {
        toast.info(`Asta abbandonata`, {
          description: `Un utente ha abbandonato l'asta per ${data.playerName || `Player ${data.playerId}`}`,
        });
      }
    };

    const handlePenaltyApplied = (data: PenaltyAppliedData & { newBudget?: number }) => {
      toast.error(`Penalità applicata: ${data.amount} crediti`, {
        description: data.reason,
        duration: 8000,
      });

      // Only proceed to update the budget if a new value is provided in the event.
      if (data.newBudget === undefined) {
        return;
      }

      // Capture the validated budget value in a new constant.
      // This helps TypeScript's type inference inside the nested 'map' function.
      const newBudgetValue = data.newBudget;

      // Update the manager state for the current user.
      setManagers((prevManagers) =>
        prevManagers.map((manager) => {
          if (manager.user_id === userId) {
            return {
              ...manager,
              current_budget: newBudgetValue,
            };
          }
          return manager;
        })
      );
    };

    const handleAutoBidActivated = (data: AutoBidActivatedData) => {
      toast.success(`Auto-bid attivata per ${data.playerName}!`, {
        description: `Offerta automatica di ${data.bidAmount} crediti piazzata.`,
        duration: 5000,
      });
    };

    // Add handler for compliance status changes
    const handleComplianceStatusChanged = (data: { userId: string; isNowCompliant: boolean; totalPenalties?: number; newBudget?: number }) => {
      console.log("[Socket Client] Compliance status changed:", data);
      setManagers((prevManagers) =>
        prevManagers.map((manager) => {
          if (manager.user_id === data.userId) {
            return {
              ...manager,
              current_budget: data.newBudget ?? manager.current_budget ?? 0, // Ensure it's always a number
              total_penalties: data.totalPenalties ?? manager.total_penalties ?? 0, // Ensure it's always a number
            };
          }
          return manager;
        })
      );
      // Update complianceData state for the specific user
      setComplianceData((prevComplianceData) => {
        const existingIndex = prevComplianceData.findIndex(
          (c) => c.user_id === data.userId
        );
        if (existingIndex > -1) {
          const newComplianceData = [...prevComplianceData];
          newComplianceData[existingIndex] = {
            ...newComplianceData[existingIndex],
            compliance_timer_start_at: data.isNowCompliant ? null : Math.floor(Date.now() / 1000), // Set timer if non-compliant
            totalPenalties: data.totalPenalties ?? 0, // Provide fallback
            newBudget: data.newBudget ?? 0, // Provide fallback
          };
          return newComplianceData;
        } else {
          return [
            ...prevComplianceData,
            {
              user_id: data.userId,
              compliance_timer_start_at: data.isNowCompliant ? null : Math.floor(Date.now() / 1000),
              totalPenalties: data.totalPenalties ?? 0, // Provide fallback
              newBudget: data.newBudget ?? 0, // Provide fallback
            },
          ];
        }
      });
      // If the current user's compliance status changed, update the local state
      if (data.userId === userId) {
        setUserComplianceStatus({
          isCompliant: data.isNowCompliant,
          isInGracePeriod: !data.isNowCompliant && (data.totalPenalties === 0 || data.totalPenalties === undefined), // Assuming grace period if no penalties yet
        });
      }
    };

    socket.on("auction-update", handleAuctionUpdate);
    socket.on("bid-surpassed-notification", handleBidSurpassed);
    socket.on("auction-closed-notification", handleAuctionClosed);
    socket.on("auction-created", handleAuctionCreated);
    socket.on("user-abandoned-auction", handleUserAbandoned);
    socket.on("penalty-applied-notification", handlePenaltyApplied);
    socket.on("auto-bid-activated-notification", handleAutoBidActivated);
    socket.on("compliance-status-changed", handleComplianceStatusChanged); // Add this line
    
    // Listen for direct user state changes to refresh response timers/states
    socket.on("auction-state-changed", () => {
      if (selectedLeagueId) {
        refreshUserAuctionStatesOld(selectedLeagueId);
      }
    });

    return () => {
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.off("auction-closed-notification", handleAuctionClosed);
      socket.off("auction-created", handleAuctionCreated);
      socket.off("user-abandoned-auction", handleUserAbandoned);
      socket.off("penalty-applied-notification", handlePenaltyApplied);
      socket.off("auto-bid-activated-notification", handleAutoBidActivated);
      socket.off("compliance-status-changed", handleComplianceStatusChanged); // Add this line
      socket.off("auction-state-changed");
      console.log(
        `[Socket Client] Leaving league room: league-${selectedLeagueId}`
      );
      socket.emit("leave-league-room", selectedLeagueId.toString());
    };
  }, [
    socket,
    isConnected,
    selectedLeagueId,
    fetchCurrentAuction,
    fetchManagersData,
    fetchBudgetData,
    refreshUserAuctionStatesOld,
    userId,
    activeAuctions, // Add activeAuctions to dependency array
    refreshComplianceData // Add refreshComplianceData to dependency array
  ]);

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
      throw new Error("Player ID or League ID is missing.");
    }
    if (
      !bypassComplianceCheck &&
      !userComplianceStatus.isCompliant &&
      !userComplianceStatus.isInGracePeriod
    ) {
      toast.error("Offerta bloccata", {
        description:
          "Non puoi fare offerte perché la tua rosa non è conforme e il periodo di grazia è terminato.",
      });
      throw new Error("Offerta bloccata per mancata conformità.");
    }
    const auctionForPlayer = activeAuctions.find(
      (a) => a.player_id === playerId
    );
    const currentBidForPlayer =
      auctionForPlayer?.current_highest_bid_amount ?? 0;
    if (amount <= currentBidForPlayer) {
      const errorMessage = `L'offerta deve essere superiore all'offerta attuale di ${currentBidForPlayer} crediti.`;
      toast.error("Offerta non valida", { description: errorMessage });
      throw new Error(errorMessage);
    }
    try {
      const response = await fetch(
        `/api/leagues/${selectedLeagueId}/players/${playerId}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            bid_type: bidType,
            max_amount: maxAmount,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Errore nel piazzare l'offerta");
      }
      toast.success("Offerta piazzata con successo!");
    } catch (error) {
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="text-xl">Caricamento...</div>
      </div>
    );
  }

  const displayedManagers = isMobile
    ? managers.filter((m) => m.user_id === (selectedManagerId || userId))
    : managers;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex-shrink-0 border-b border-border bg-card p-4">
        {/* League Selector Header */}
        <div className="mb-4 flex items-center justify-between">
          <LeagueSelector
            leagues={leagues}
            selectedLeagueId={selectedLeagueId}
            onLeagueChange={handleLeagueChange}
            isLoading={isLoading}
          />
          {selectedLeagueId && (
            <div className="text-sm text-muted-foreground">
              League ID: {selectedLeagueId}
            </div>
          )}
        </div>
        
        <CallPlayerInterface
          leagueId={selectedLeagueId || 0}
          userId={userId}
          onStartAuction={(playerId) =>
            console.log(`Auction started for player ${playerId}`)
          }
        />
      </div>
      <div className="scrollbar-hide flex flex-1 flex-col overflow-x-auto p-2 md:flex-row md:space-x-2">
        {isMobile && (
          <div className="w-full p-2 md:hidden">
            <Button
              onClick={() => setIsTeamSelectorOpen(true)}
              className="w-full"
            >
              Visualizza Squadre
            </Button>
          </div>
        )}
        <TeamSelectorModal
          isOpen={isTeamSelectorOpen}
          onClose={() => setIsTeamSelectorOpen(false)}
          managers={managers}
          onSelectTeam={(managerId) => setSelectedManagerId(managerId)}
          onShowAllTeams={() => setSelectedManagerId(null)}
        />
        {displayedManagers.length > 0 ? (
          displayedManagers.map((manager, index) => {
            const managerCompliance = complianceData.find(
              (c) => c.user_id === manager.user_id
            );
            return (
              <div
                key={`${manager.user_id}-${index}`}
                className="min-w-0 flex-1"
              >
                <ManagerColumn
                  manager={manager}
                  isCurrentUser={manager.user_id === userId}
                  isHighestBidder={
                    currentAuction?.current_highest_bidder_id ===
                    manager.user_id
                  }
                  position={index + 1}
                  leagueSlots={leagueSlots ?? undefined}
                  activeAuctions={activeAuctions}
                  autoBids={autoBids}
                  currentAuctionPlayerId={currentAuction?.player_id}
                  userAuctionStates={
                    manager.user_id === userId ? userAuctionStates : []
                  }
                  leagueId={selectedLeagueId ?? undefined}
                  handlePlaceBid={handlePlaceBid}
                  onComplianceChange={setUserComplianceStatus}
                  complianceTimerStartAt={
                    managerCompliance?.compliance_timer_start_at || null
                  }
                  onPenaltyApplied={() => refreshComplianceData(selectedLeagueId!)}
                  userAutoBidOverlay={userAutoBidOverlay}
                  setUserAutoBidOverlay={setUserAutoBidOverlay}
                />
              </div>
            );
          })
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
      {selectedLeagueId && <SocketDebugger leagueId={selectedLeagueId} />}
    </div>
  );
}
