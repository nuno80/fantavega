"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { CallPlayerInterface } from "@/components/auction/CallPlayerInterface";
import { MemoizedManagerColumn as ManagerColumn } from "@/components/auction/ManagerColumn";
// import { SocketDebugger } from "@/components/debug/SocketDebugger";
import { useSocket } from "@/contexts/SocketContext";
import { useMobile } from "@/hooks/use-mobile";
import { useInactivityRedirect } from "@/hooks/useInactivityRedirect";
import { useLeague } from "@/hooks/useLeague";

// Dynamic import per lazy loading del modale - riduce il bundle iniziale
const StandardBidModal = dynamic(
  () =>
    import("@/components/auction/StandardBidModal").then((mod) => mod.StandardBidModal),
  {
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
    ssr: false,
  }
);

import { placeBidAction } from "@/lib/actions/auction.actions";
import {
  ActiveAuction,
  AutoBidCount,
  LeagueSlots,
  ManagerWithRoster,
} from "@/lib/db/services/auction-league.service";
import { UserAuctionStateDetail } from "@/lib/db/services/auction-states.service";
import { AuctionStatusDetails } from "@/lib/db/services/bid.service";
import { ComplianceRecord } from "@/lib/db/services/penalty.service";

// Interface definitions
interface AuctionPageContentProps {
  userId: string;
  initialLeagueId?: number | null;
  initialManagers?: ManagerWithRoster[];
  initialLeagueSlots?: LeagueSlots;
  initialActiveAuctions?: ActiveAuction[];
  initialAutoBids?: AutoBidCount[];
  initialCurrentAuction?: AuctionStatusDetails | null;
  initialComplianceData?: ComplianceRecord[];
  initialUserAuctionStates?: UserAuctionStateDetail[];
  initialLeagueStatus?: string;
}

interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  total_budget: number;
}

interface LeagueInfo {
  id: number;
  name: string;
  status: string;
}

export function AuctionPageContent({
  userId,
  initialLeagueId,
  initialManagers,
  initialLeagueSlots,
  initialActiveAuctions,
  initialAutoBids,
  initialCurrentAuction,
  initialComplianceData,
  initialUserAuctionStates,
  initialLeagueStatus,
}: AuctionPageContentProps) {
  const router = useRouter();
  const { socket, isConnected } = useSocket();
  const isMobile = useMobile();
  const { selectedLeagueId, switchToLeague } = useLeague();

  // Redirect to home after 30 seconds of inactivity
  useInactivityRedirect({ timeoutSeconds: 30 });

  // Initialize state with props if available, otherwise default
  const [managers, setManagers] = useState<ManagerWithRoster[]>(initialManagers || []);
  const [activeAuctions, setActiveAuctions] = useState<ActiveAuction[]>(initialActiveAuctions || []);
  const [autoBids, setAutoBids] = useState<AutoBidCount[]>(initialAutoBids || []);
  const [leagueSlots, setLeagueSlots] = useState<LeagueSlots | null>(initialLeagueSlots || null);
  const [currentAuction, setCurrentAuction] = useState<AuctionStatusDetails | null>(
    initialCurrentAuction || null
  );
  const [complianceData, setComplianceData] = useState<ComplianceRecord[]>(initialComplianceData || []);
  const [userAuctionStates, setUserAuctionStates] = useState<UserAuctionStateDetail[]>(initialUserAuctionStates || []);

  const [isLoading, setIsLoading] = useState(!initialManagers); // Only load if no initial data
  const [error, setError] = useState<string | null>(null);
  const [currentUserBudget, setCurrentUserBudget] = useState<UserBudgetInfo | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
  const [leagueStatus, setLeagueStatus] = useState<string | undefined>(initialLeagueStatus);

  const [isTeamSelectorOpen, setIsTeamSelectorOpen] = useState(false);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [userComplianceStatus, setUserComplianceStatus] = useState({
    isCompliant: true,
    isInGracePeriod: true,
  });

  // Bid Modal State
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [bidModalProps, setBidModalProps] = useState<{
    playerId: number;
    playerName: string;
    playerRole: string;
    playerTeam: string;
    currentBid: number;
    leagueId: number;
  } | null>(null);

  // Sincronizza selectedLeagueId con initialLeagueId dal SSR (senza redirect)
  useEffect(() => {
    if (initialLeagueId && !selectedLeagueId) {
      // Usa skipNavigation=true per evitare il redirect che causa il flicker
      switchToLeague(initialLeagueId, true);
    }
  }, [initialLeagueId, selectedLeagueId, switchToLeague]);

  // Set initial user budget if managers are available
  useEffect(() => {
    if (initialManagers && userId) {
      const currentUser = initialManagers.find((m) => m.user_id === userId);
      if (currentUser) {
        setCurrentUserBudget({
          current_budget: currentUser.current_budget,
          locked_credits: currentUser.locked_credits,
          total_budget: currentUser.total_budget,
        });
      }
    }
  }, [initialManagers, userId]);

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
        if (data.leagueStatus) {
          setLeagueStatus(data.leagueStatus);
        }

        // Update user budget
        const currentUser = data.managers.find(
          (m: ManagerWithRoster) => m.user_id === userId
        );
        if (currentUser) {
          console.log('[BUDGET_UPDATE] Updating budget after data fetch:', {
            current_budget: currentUser.current_budget,
            locked_credits: currentUser.locked_credits,
            total_budget: currentUser.total_budget,
            available: currentUser.current_budget - currentUser.locked_credits
          });
          setCurrentUserBudget({
            current_budget: currentUser.current_budget,
            locked_credits: currentUser.locked_credits,
            total_budget: currentUser.total_budget,
          });
        }
      }
    } catch (e) {
      console.error("Error fetching managers data:", e);
      toast.error("Errore nel caricamento dei manager.");
    }
  }, [userId]);

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

  const fetchComplianceData = useCallback(async (leagueId: number) => {
    try {
      const complianceResponse = await fetch(
        `/api/leagues/${leagueId}/all-compliance-status?_t=${Date.now()}`
      );
      if (complianceResponse.ok) {
        const data = await complianceResponse.json();
        setComplianceData(data || []);
      } else {
        console.error("Failed to fetch compliance data");
      }
    } catch (error) {
      console.error("Error fetching compliance data:", error);
    }
  }, []);

  const fetchUserAuctionStates = useCallback(async (leagueId: number) => {
    try {
      const res = await fetch(`/api/user/auction-states?leagueId=${leagueId}`);
      if (res.ok) {
        const data = await res.json();
        // The API returns { states: [...], count: ... }
        setUserAuctionStates(data.states || []);
      }
    } catch (e) {
      console.error("Error fetching user auction states:", e);
    }
  }, []);

  // Helper function to refresh compliance and budget data after penalty
  const refreshComplianceData = useCallback(async () => {
    if (!selectedLeagueId) return;

    try {
      // Refresh compliance data
      await fetchComplianceData(selectedLeagueId);

      // Refresh managers data (includes updated budgets and penalty counts)
      await fetchManagersData(selectedLeagueId);
    } catch (error) {
      console.error("Error refreshing compliance data:", error);
    }
  }, [selectedLeagueId, fetchComplianceData, fetchManagersData]);

  // Effect for initial data load and re-fetching when league changes
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!selectedLeagueId) return;

      // Skip fetch if we have initial data for this league and it's the first load
      if (
        initialLeagueId === selectedLeagueId &&
        managers.length > 0 &&
        !isLoading
      ) {
        return;
      }

      setIsLoading(true);
      try {
        // Trigger compliance check on page access
        try {
          await fetch("/api/user/trigger-login-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          console.log("Compliance check triggered successfully");
        } catch (error) {
          console.warn("Failed to trigger compliance check:", error);
        }

        await Promise.all([
          fetchManagersData(selectedLeagueId),
          fetchCurrentAuction(selectedLeagueId),
          fetchComplianceData(selectedLeagueId),
          fetchUserAuctionStates(selectedLeagueId),
        ]);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        toast.error("Errore nel caricamento dei dati della lega.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedLeagueId,
    fetchManagersData,
    fetchCurrentAuction,
    fetchComplianceData,
    fetchUserAuctionStates,
    initialLeagueId
  ]);

  // Use ref to track the last compliance status notification to avoid dependency cycles
  const lastComplianceNotificationRef = useRef<{
    userId: string;
    isCompliant: boolean;
    timestamp: number;
  } | null>(null);

  // Socket event handlers
  useEffect(() => {
    if (!isConnected || !socket || !selectedLeagueId) return;

    socket.emit("join-room", `league-${selectedLeagueId}`);
    socket.emit("join-room", `user-${userId}`);

    const handleAuctionUpdate = (data: {
      playerId: number;
      newPrice: number;
      highestBidderId: string;
      scheduledEndTime: number;
      action?: string; // Added to handle abandon events
      budgetUpdates?: Array<{ userId: string; newLockedCredits: number }>; // Real-time budget updates
    }) => {
      // Se l'asta è stata abbandonata, aggiorniamo immediatamente con i dati ricevuti
      if (data.action === "abandoned") {
        console.log("[SOCKET DEBUG] Auction abandoned, updating UI with complete data...");

        // Aggiorna istantaneamente locked_credits se presente nel payload
        if (data.budgetUpdates) {
          const myBudgetUpdate = data.budgetUpdates.find(u => u.userId === userId);
          if (myBudgetUpdate) {
            console.log("[BUDGET_UPDATE] Instant locked_credits update:", myBudgetUpdate.newLockedCredits);
            setCurrentUserBudget(prev => prev ? {
              ...prev,
              locked_credits: myBudgetUpdate.newLockedCredits,
            } : prev);
            // Aggiorna anche nel managers array
            setManagers(prev => prev.map(m =>
              m.user_id === userId
                ? { ...m, locked_credits: myBudgetUpdate.newLockedCredits }
                : m
            ));
          }
        }

        // Aggiorna immediatamente lo stato locale con i dati ricevuti
        if (data.newPrice !== undefined && data.highestBidderId && data.scheduledEndTime) {
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
        }

        // Poi ricarica i dati completi per sincronizzazione
        fetchManagersData(selectedLeagueId);
        fetchUserAuctionStates(selectedLeagueId);
        return;
      }

      // Update currentAuction state locally (no refetch)
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

      // Update activeAuctions state locally (no refetch)
      setActiveAuctions((prevAuctions) =>
        prevAuctions.map((auction) => {
          if (auction.player_id === data.playerId) {
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

      // Refresh user auction states to show response_needed slots
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleAuctionCreated = (data: { playerName: string }) => {
      // Toast rimosso - la UI si aggiorna già mostrando la nuova asta
      fetchCurrentAuction(selectedLeagueId);
      fetchManagersData(selectedLeagueId);
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleBidSurpassed = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      toast.warning(`La tua offerta per ${data.playerName} è stata superata!`, {
        description: `Nuova offerta: ${data.newBidAmount} crediti.`,
      });
      fetchUserAuctionStates(selectedLeagueId);
      fetchCurrentAuction(selectedLeagueId);
    };

    const handleAuctionStateChanged = (data: unknown) => {
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleComplianceStatusChange = (data: {
      userId: string;
      isCompliant: boolean;
      appliedPenaltyAmount?: number;
      timestamp: number;
    }) => {
      const lastNotification = lastComplianceNotificationRef.current;
      const isDuplicate = lastNotification &&
        lastNotification.userId === data.userId &&
        lastNotification.isCompliant === data.isCompliant &&
        Date.now() - lastNotification.timestamp < 5000;

      lastComplianceNotificationRef.current = {
        userId: data.userId,
        isCompliant: data.isCompliant,
        timestamp: Date.now()
      };

      fetchComplianceData(selectedLeagueId);
      fetchManagersData(selectedLeagueId);

      if (data.userId === userId && !isDuplicate) {
        if (data.appliedPenaltyAmount && data.appliedPenaltyAmount > 0) {
          toast.error(
            `Ti è stata applicata una penalità di ${data.appliedPenaltyAmount} crediti per rosa non conforme.`
          );
        } else if (!data.isCompliant) {
          toast.warning(
            "Attenzione: La tua rosa non rispetta i requisiti minimi. Hai 1 ora per rimediare."
          );
        } else {
          toast.success("La tua rosa è ora conforme ai requisiti.");
        }
      }
    };

    const handlePenaltyApplied = (data: {
      amount: number;
      reason: string;
    }) => {
      console.log("[SOCKET DEBUG] Received penalty-applied-notification:", data);
      toast.error(`Penalità applicata: ${data.amount} crediti`, {
        description: data.reason,
      });
      refreshComplianceData();
    };

    const handleRoomJoined = (data: { room: string }) => {
      console.log(`✅ Joined room: ${data.room}`);
    };

    const handleAuctionClosed = (data: {
      playerName: string;
      finalPrice: number;
      winnerId: string;
    }) => {
      console.log("[SOCKET DEBUG] Received auction-closed-notification:", data);
      // Toast rimosso - la UI si aggiorna già mostrando il risultato
      fetchCurrentAuction(selectedLeagueId);
      fetchManagersData(selectedLeagueId);
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleUserAbandoned = (data: {
      playerName: string;
      userId: string;
    }) => {
      console.log("[SOCKET DEBUG] Received user-abandoned-auction:", data);
      // Toast rimosso - il modale si chiude e la UI si aggiorna
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleAutoBidActivated = (data: {
      playerName: string;
      newBidAmount: number;
    }) => {
      console.log("[SOCKET DEBUG] Received auto-bid-activated-notification:", data);
      // Toast rimosso - il prezzo si aggiorna già nella UI
      fetchCurrentAuction(selectedLeagueId);
      fetchUserAuctionStates(selectedLeagueId);
    };

    const handleLeagueStatusChanged = (data: {
      leagueId: number;
      newStatus: string;
    }) => {
      console.log("[SOCKET DEBUG] Received league-status-changed:", data);
      if (data.leagueId === selectedLeagueId) {
        setLeagueStatus(data.newStatus);
        // Toast rimosso - le icone cambiano già nella UI
      }
    };

    socket.on("auction-update", handleAuctionUpdate);
    socket.on("auction-created", handleAuctionCreated);
    socket.on("bid-surpassed-notification", handleBidSurpassed);
    socket.on("auction-state-changed", handleAuctionStateChanged);
    socket.on("auction-closed-notification", handleAuctionClosed);
    socket.on("user-abandoned-auction", handleUserAbandoned);
    socket.on("auto-bid-activated-notification", handleAutoBidActivated);
    socket.on("compliance-status-changed", handleComplianceStatusChange);
    socket.on("penalty-applied-notification", handlePenaltyApplied);
    socket.on("room-joined", handleRoomJoined);
    socket.on("league-status-changed", handleLeagueStatusChanged);

    return () => {
      socket.off("auction-update", handleAuctionUpdate);
      socket.off("auction-created", handleAuctionCreated);
      socket.off("bid-surpassed-notification", handleBidSurpassed);
      socket.off("auction-state-changed", handleAuctionStateChanged);
      socket.off("auction-closed-notification", handleAuctionClosed);
      socket.off("user-abandoned-auction", handleUserAbandoned);
      socket.off("auto-bid-activated-notification", handleAutoBidActivated);
      socket.off("compliance-status-changed", handleComplianceStatusChange);
      socket.off("penalty-applied-notification", handlePenaltyApplied);
      socket.off("room-joined", handleRoomJoined);
      socket.off("league-status-changed", handleLeagueStatusChanged);
      socket.emit("leave-room", `league-${selectedLeagueId}`);
      socket.emit("leave-room", `user-${userId}`);
    };
  }, [
    socket,
    isConnected,
    selectedLeagueId,
    userId,
    fetchManagersData,
    fetchCurrentAuction,
    fetchComplianceData,
    fetchUserAuctionStates,
    refreshComplianceData
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
      return;
    }

    try {
      const result = await placeBidAction(
        selectedLeagueId,
        playerId,
        amount,
        bidType,
        maxAmount
      );

      if (!result.success) {
        throw new Error(result.error || "Errore nel piazzare l'offerta");
      }

      // Toast rimosso - la UI si aggiorna mostrando il nuovo prezzo
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error("Errore offerta", { description: errorMessage });
    }
  };

  // Refs for stable callbacks
  const activeAuctionsRef = useRef(activeAuctions);
  const currentAuctionRef = useRef(currentAuction);

  useEffect(() => {
    activeAuctionsRef.current = activeAuctions;
  }, [activeAuctions]);

  useEffect(() => {
    currentAuctionRef.current = currentAuction;
  }, [currentAuction]);

  const handleOpenBidModal = useCallback(
    (playerId: number) => {
      if (!selectedLeagueId) return;

      const currentActiveAuctions = activeAuctionsRef.current;
      const currentAuctionData = currentAuctionRef.current;

      // Look for the auction in active auctions
      const auction = currentActiveAuctions.find((a) => a.player_id === playerId);

      // Also check current auction if it matches
      const isCurrentAuction = currentAuctionData?.player_id === playerId;

      if (auction) {
        setBidModalProps({
          playerId,
          playerName: auction.player_name,
          playerRole: auction.player_role,
          playerTeam: auction.player_team,
          currentBid: auction.current_highest_bid_amount,
          leagueId: selectedLeagueId,
        });
        setIsBidModalOpen(true);
      } else if (isCurrentAuction && currentAuctionData) {
        setBidModalProps({
          playerId,
          playerName: currentAuctionData.player_name || "Giocatore",
          playerRole: currentAuctionData.player?.role || "",
          playerTeam: currentAuctionData.player?.team || "",
          currentBid: currentAuctionData.current_highest_bid_amount,
          leagueId: selectedLeagueId,
        });
        setIsBidModalOpen(true);
      } else {
        toast.error("Impossibile trovare i dettagli dell'asta per questo giocatore.");
      }
    },
    [selectedLeagueId]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-2 text-muted-foreground">Caricamento dati...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-destructive">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900 transition-colors duration-300 dark:from-gray-900 dark:to-gray-950 dark:text-white">
      {/* Top Panel - Call Player Interface */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white/80 p-2 backdrop-blur-md transition-colors duration-300 dark:border-gray-800 dark:bg-gray-900/80">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            {selectedLeagueId && (
              <CallPlayerInterface leagueId={selectedLeagueId} userId={userId} />
            )}
          </div>
          {/* <ThemeToggle /> */}
        </div>
      </div>

      {/* Bottom Panel - Manager Columns (Horizontal Grid on Desktop, Vertical on Mobile) */}
      <div className="flex flex-1 flex-col space-y-2 overflow-y-auto px-2 py-1 md:flex-row md:space-x-2 md:space-y-0 md:overflow-x-auto">
        {managers.length > 0 ? (
          // Sort managers: Current user first, then others
          [...managers]
            .sort((a, b) => {
              if (a.user_id === userId) return -1;
              if (b.user_id === userId) return 1;
              // Ordinamento secondario stabile per nome team (alfabetico)
              return a.manager_team_name.localeCompare(b.manager_team_name);
            })
            .map((manager, index) => {
              const compliance = complianceData.find(
                (c) => String(c.user_id) === String(manager.user_id)
              );

              return (
                <div
                  key={`${manager.user_id}-${index}`}
                  className="w-full flex-1 border-b-8 border-blue-400 pb-4 last:border-0 dark:border-blue-600 md:min-w-[45vw] md:border-0 md:pb-0 lg:min-w-[350px]"
                >
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
                    currentAuctionPlayerId={currentAuction?.player_id}
                    userAuctionStates={
                      manager.user_id === userId ? userAuctionStates : []
                    }
                    leagueId={selectedLeagueId ?? undefined}
                    leagueStatus={leagueStatus}
                    handlePlaceBid={handlePlaceBid}
                    complianceTimerStartAt={
                      compliance?.compliance_timer_start_at || null
                    }
                    onPenaltyApplied={() => selectedLeagueId && fetchComplianceData(selectedLeagueId)}
                    onPlayerDiscarded={() => selectedLeagueId && fetchManagersData(selectedLeagueId)}
                    onOpenBidModal={handleOpenBidModal}
                    currentUserId={userId}
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
            </div>
          </div>
        )}
      </div>
      {/* Global Bid Modal */}
      {isBidModalOpen && bidModalProps && (
        <StandardBidModal
          isOpen={isBidModalOpen}
          onClose={() => setIsBidModalOpen(false)}
          playerName={bidModalProps.playerName}
          playerRole={bidModalProps.playerRole}
          playerTeam={bidModalProps.playerTeam}
          playerId={bidModalProps.playerId}
          leagueId={bidModalProps.leagueId}
          currentBid={bidModalProps.currentBid}
          isNewAuction={false}
          title="Rilancia Offerta"
          onBidSuccess={async (amount, bidType, maxAmount) => {
            if (bidModalProps) {
              await handlePlaceBid(amount, bidType, bidModalProps.playerId, false, maxAmount);
              setIsBidModalOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}
