"use client";

import {
  getFantacalcioImageUrl,
  getPlayerImageUrl,
  getTeamLogoUrl,
} from "@/lib/utils";
import React, { memo, useEffect, useState } from "react";

import {
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Gavel,
  Info,
  Lock,
  Star,
  Trash2,
  User,
  X
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";


import { UserAuctionStateDetail } from "@/lib/db/services/auction-states.service";
import { ComplianceTimer } from "./ComplianceTimer";
import { DiscardPlayerModal } from "./DiscardPlayerModal";
import { ResponseActionModal } from "./ResponseActionModal";

// Type definitions
interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
  assigned_at?: number; // Added optional for backward compatibility
  photo_url?: string | null;
}

// ... (Manager interface defs)



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

// Alias for compatibility with shared types
type ManagerWithRoster = Manager;

interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

interface ActiveAuction {
  id: number;
  player_id: number;
  player_name: string;
  player_role: string;
  player_team: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string | null;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
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

interface AutoBid {
  player_id: number;
  max_amount: number;
  is_active: boolean;
  user_id: string; // Added user_id to identify the owner of the auto-bid
}

// Discriminated union for Slot
type Slot =
  | { type: "assigned"; player: PlayerInRoster }
  | { type: "in_auction"; auction: ActiveAuction }
  | { type: "response_needed"; state: UserAuctionStateDetail }
  | { type: "empty" };

interface AutoBidCount {
  player_id: number;
  auto_bid_count: number;
  max_amount?: number; // Added for compatibility
}

interface ManagerColumnProps {
  manager: ManagerWithRoster;
  isCurrentUser: boolean;
  isHighestBidder?: boolean;
  position?: number;
  leagueSlots?: LeagueSlots;
  activeAuctions?: ActiveAuction[];
  autoBids?: AutoBidCount[];
  userAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
  currentAuctionPlayerId?: number;
  userAuctionStates?: UserAuctionStateDetail[];
  leagueId?: number;
  leagueStatus?: string;
  handlePlaceBid?: (
    amount: number,
    bidType: "manual" | "quick",
    targetPlayerId?: number,
    bypassComplianceCheck?: boolean,
    maxAmount?: number
  ) => Promise<void>;
  complianceTimerStartAt?: number | null;
  onPenaltyApplied?: () => void; // Callback for when penalty is applied
  onPlayerDiscarded?: () => void; // Callback for when player is discarded
  onOpenBidModal?: (playerId: number) => void; // Callback to open bid modal
  currentUserId?: string; // Current user ID for bid icon visibility
}

// Helper functions
const getRoleColor = (role: string) => {
  switch (role.toUpperCase()) {
    case "P":
      return "bg-yellow-500";
    case "D":
      return "bg-green-500";
    case "C":
      return "bg-blue-500";
    case "A":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
};

// New Pastel Colors for backgrounds
const getRolePastelColor = (role: string) => {
  switch (role.toUpperCase()) {
    case "P":
      return "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50";
    case "D":
      return "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700/50";
    case "C":
      return "bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-700/50";
    case "A":
      return "bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-700/50";
    default:
      return "bg-muted/50 border-border";
  }
};

const formatTimeRemaining = (endTime: number) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, endTime - now);

  if (remaining === 0) return { text: "Scaduto", color: "text-red-500", percent: 0, remaining: 0 };

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  // Calculate percentage for progress bar (assuming 60s max for short timer visual)
  const percent = Math.min(100, (remaining / 60) * 100);

  let color = "text-foreground";
  let text = "";

  if (remaining < 300) {
    color = "text-red-500";
    text = remaining < 60 ? `${seconds} s` : `${minutes} m`;
  } else if (remaining < 3600) {
    color = "text-orange-400";
    text = `${minutes} m`;
  } else {
    text = `${hours}h ${minutes} m`;
  }

  return { text, color, percent, remaining };
};

// Slot Components
function AssignedSlot({
  player,
  role,
  isCurrentUser,
  leagueStatus,
  leagueId,
  onPlayerDiscarded,
}: {
  player: PlayerInRoster;
  role: string;
  isCurrentUser: boolean;
  leagueStatus?: string;
  leagueId?: number;
  onPlayerDiscarded?: () => void;
}) {
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const roleColor = getRoleColor(role);
  const pastelClass = getRolePastelColor(role);

  // DEBUG: Log photo_url to verify it's being received
  // console.log('[AssignedSlot] Player:', player.name, 'photo_url:', player.photo_url);

  // Show trash icon only if current user and league is in repair mode
  const showDiscardOption = isCurrentUser && leagueStatus === "repair_active";

  return (
    <>
      <div
        className={`flex items-center justify-between rounded-md p-1.5 border ${pastelClass} transition-colors hover:bg-opacity-20`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {/* Player Photo */}
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-muted-foreground/20 bg-muted">
            {(player.photo_url || player.id) && (
              <img
                src={getPlayerImageUrl(player.id, player.photo_url, player.name, player.team)}
                alt={player.name}
                className="h-full w-full object-cover object-top"
                style={{
                  objectPosition: "50% 15%",
                }}
                onError={(e) => {
                  const target = e.currentTarget;
                  const cleanUrl = (url: string) => url?.split("?")[0]?.split("#")[0];

                  const fantaUrl =
                    player.id && getFantacalcioImageUrl(player.id);
                  const teamLogo = getTeamLogoUrl(player.team || "");

                  const currentSrc = cleanUrl(target.src);
                  const safeFantaUrl = fantaUrl ? cleanUrl(fantaUrl) : null;
                  const safeTeamLogo = teamLogo ? cleanUrl(teamLogo) : null;

                  if (fantaUrl && currentSrc !== safeFantaUrl && target.src !== fantaUrl) {
                    target.src = fantaUrl;
                  } else if (
                    teamLogo &&
                    currentSrc !== safeTeamLogo &&
                    target.src !== teamLogo
                  ) {
                    target.src = teamLogo;
                    target.style.objectPosition = "center";
                    target.className = "h-full w-full object-contain p-1";
                    target.onerror = () => {
                      target.style.display = "none";
                      target.nextElementSibling?.classList.remove("hidden");
                    };
                  } else {
                    target.style.display = "none";
                    target.nextElementSibling?.classList.remove("hidden");
                  }
                }}
              />
            )}
            <div
              className={`flex h-full w-full items-center justify-center ${player.photo_url || player.id ? "hidden" : ""
                }`}
            >
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <div
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${roleColor}`}
          />
          <span className="truncate text-sm font-medium">{player.name}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
            {player.assignment_price}
          </span>
          {showDiscardOption ? (
            <button
              onClick={() => setShowDiscardModal(true)}
              className="rounded p-1 transition-colors hover:bg-red-600/20"
              title="Scarta giocatore"
            >
              <Trash2 className="h-3 w-3 text-red-400" />
            </button>
          ) : (
            <Lock className="h-3 w-3 text-gray-400/50" />
          )}
        </div>
      </div>

      {/* Discard Player Modal */}
      {showDiscardModal && leagueId && (
        <DiscardPlayerModal
          isOpen={showDiscardModal}
          onClose={() => setShowDiscardModal(false)}
          player={{
            id: player.id,
            name: player.name,
            role: player.role,
            team: player.team,
          }}
          leagueId={leagueId}
          onPlayerDiscarded={() => {
            setShowDiscardModal(false);
            onPlayerDiscarded?.();
          }}
        />
      )}
    </>
  );
}

function ResponseNeededSlot({
  state,
  role,
  leagueId,
  isLast,
  onCounterBid,
  isCurrentUser,
}: {
  state: UserAuctionStateDetail;
  role: string;
  leagueId: number;
  isLast: boolean;
  onCounterBid: (playerId: number) => void;
  isCurrentUser: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const [currentTimeRemaining, setCurrentTimeRemaining] = useState(
    state.time_remaining === null ? Infinity : state.time_remaining
  );

  const roleColor = getRoleColor(role);

  // Response timer countdown effect
  useEffect(() => {
    // If null or undefined, treat as active/infinity
    if (state.time_remaining === null || state.time_remaining === undefined) {
      setCurrentTimeRemaining(Infinity);
      return;
    }

    if (state.time_remaining <= 0) {
      setCurrentTimeRemaining(0);
      return;
    }

    setCurrentTimeRemaining(state.time_remaining);

    const interval = setInterval(() => {
      setCurrentTimeRemaining((prev) => {
        if (prev === Infinity) return Infinity;
        if (prev <= 0) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.time_remaining]);

  // Format response timer (hours and minutes only)
  const formatResponseTimer = (seconds: number) => {
    if (seconds === Infinity) return "Attivo";
    if (seconds <= 0) return "Scaduto";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes} m`;
    }
    return `${minutes} m`;
  };

  // Get timer color based on remaining time
  const getTimerColor = (seconds: number) => {
    if (seconds === Infinity) return "text-green-500";
    if (seconds <= 0) return "text-red-500";
    if (seconds <= 300) return "text-red-400"; // Under 5 minutes: red
    if (seconds <= 1800) return "text-yellow-400"; // Under 30 minutes: yellow
    return "text-green-400"; // Over 30 minutes: green
  };

  const progressPercent = Math.min(100, (currentTimeRemaining === Infinity ? 3600 : currentTimeRemaining / 3600) * 100); // Scale to 1 hour

  return (
    <>
      <div
        className={`relative flex flex-col overflow-hidden border border-red-200 bg-red-50 p-1.5 dark:border-red-500/50 dark:bg-red-900/10 ${isLast ? "rounded-b-md" : ""}`}
      >
        {/* Progress Bar Background */}
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-red-500 transition-all duration-1000"
          style={{ width: `${progressPercent}% ` }}
        />

        <div className="flex items-center justify-between">
          {/* Left side: Player info */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Player Avatar */}
            {/* Player Avatar */}
            <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-700">
              {(state.player_photo_url || state.player_id) && (
                <img
                  src={getPlayerImageUrl(
                    state.player_id,
                    state.player_photo_url,
                    state.player_name,
                    state.player_team
                  )}
                  alt={state.player_name}
                  className="h-9 w-9 flex-shrink-0 rounded-full object-cover object-top"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const cleanUrl = (url: string) => url?.split("?")[0]?.split("#")[0];
                    const fantaUrl =
                      state.player_id &&
                      getFantacalcioImageUrl(state.player_id);
                    const teamLogo = getTeamLogoUrl(state.player_team || "");

                    const currentSrc = cleanUrl(target.src);
                    const safeFantaUrl = fantaUrl ? cleanUrl(fantaUrl) : null;
                    const safeTeamLogo = teamLogo ? cleanUrl(teamLogo) : null;

                    if (
                      fantaUrl &&
                      currentSrc !== safeFantaUrl &&
                      target.src !== fantaUrl
                    ) {
                      target.src = fantaUrl;
                    } else if (
                      teamLogo &&
                      currentSrc !== safeTeamLogo &&
                      target.src !== teamLogo
                    ) {
                      target.src = teamLogo;
                      target.className =
                        "h-full w-full object-contain p-1 rounded-full";
                      target.onerror = () => {
                        target.style.display = "none";
                        target.nextElementSibling?.classList.remove("hidden");
                      };
                    } else {
                      target.style.display = "none";
                      target.nextElementSibling?.classList.remove("hidden");
                    }
                  }}
                />
              )}
              <div
                className={`flex h-full w-full items-center justify-center ${state.player_photo_url || state.player_id ? "hidden" : ""
                  }`}
              />
            </div>

            {/* Player name and timer */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1">
                <div
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${roleColor}`}
                />
                <span className="truncate text-sm font-medium text-red-600 dark:text-red-300">
                  {state.player_name}
                </span>
              </div>
              {/* Response Timer */}
              {currentTimeRemaining > 0 || currentTimeRemaining === Infinity ? (
                <span
                  className={`font-mono text-sm font-bold tabular-nums ${getTimerColor(currentTimeRemaining)} ${currentTimeRemaining <= 300 && currentTimeRemaining !== Infinity ? "animate-pulse" : ""}`}
                >
                  {formatResponseTimer(currentTimeRemaining)}
                </span>
              ) : (
                <span className="text-sm font-bold text-red-500">Scaduto</span>
              )}
            </div>
          </div>

          {/* Right side: Price and buttons */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-foreground tabular-nums">{state.current_bid}</span>
            <button
              onClick={() => onCounterBid(state.player_id)}
              className="rounded p-1 transition-colors hover:bg-green-600/20"
              title="Rilancia"
              disabled={(currentTimeRemaining <= 0 && currentTimeRemaining !== Infinity) || !isCurrentUser}
            >
              <DollarSign
                className={`h-3 w-3 ${(currentTimeRemaining <= 0 && currentTimeRemaining !== Infinity) || !isCurrentUser ? "text-gray-500" : "text-green-400"}`}
              />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="rounded p-1 transition-colors hover:bg-red-600/20"
              title="Abbandona"
              disabled={currentTimeRemaining <= 0 || !isCurrentUser}
            >
              <X
                className={`h-3 w-3 ${currentTimeRemaining <= 0 || !isCurrentUser ? "text-gray-500" : "text-red-400"}`}
              />
            </button>
          </div>
        </div>
      </div>

      <ResponseActionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        playerName={state.player_name}
        currentBid={state.current_bid}
        timeRemaining={currentTimeRemaining}
        leagueId={leagueId}
        playerId={state.player_id}
        onCounterBid={() => onCounterBid(state.player_id)}
      />
    </>
  );
}

function InAuctionSlot({
  auction,
  role,
  isLast,
  isCurrentUser,
  leagueId,
  currentUserId,
  onOpenBidModal,
}: {
  auction: ActiveAuction;
  role: string;
  isLast: boolean;
  isCurrentUser: boolean;
  leagueId?: number;
  currentUserId?: string;
  onOpenBidModal?: (playerId: number) => void;
}) {
  const [playerAutoBid, setPlayerAutoBid] = useState<{
    max_amount: number;
    is_active: boolean;
  } | null>(null);

  // Track previous bid to trigger flash animation
  const [prevBid, setPrevBid] = useState(auction.current_highest_bid_amount);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (auction.current_highest_bid_amount !== prevBid) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 1000);
      setPrevBid(auction.current_highest_bid_amount);
      return () => clearTimeout(timer);
    }
  }, [auction.current_highest_bid_amount, prevBid]);

  const timeInfo = formatTimeRemaining(auction.scheduled_end_time);
  const roleColor = getRoleColor(role);
  const pastelClass = getRolePastelColor(role);

  // Fetch auto-bid for this specific player if current user
  useEffect(() => {
    if (isCurrentUser && leagueId) {
      const fetchPlayerAutoBid = async () => {
        try {
          const response = await fetch(
            `/api/leagues/${leagueId}/players/${auction.player_id}/auto-bid`
          );
          if (response.ok) {
            const data = await response.json();
            setPlayerAutoBid(data.auto_bid);
          }
        } catch (error) {
          console.error("Error fetching player auto-bid:", error);
        }
      };
      fetchPlayerAutoBid();
    }
  }, [
    isCurrentUser,
    leagueId,
    auction.player_id,
  ]);

  // Show user's auto-bid for this specific player (only their own)
  const showUserAutoBid =
    isCurrentUser && playerAutoBid && playerAutoBid.is_active;

  return (
    <div
      className={`relative flex items-center justify-between p-1.5 border ${pastelClass} ${isLast ? "rounded-b-md" : ""} transition-all duration-300 ${flash ? "bg-green-100 dark:bg-green-500/20" : ""}`}
    >
      {/* Timer Progress Bar for short durations */}
      {timeInfo.remaining < 60 && (
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-red-500 transition-all duration-1000"
          style={{ width: `${timeInfo.percent}%` }}
        />
      )}

      <div className="flex min-w-0 items-center gap-2">
        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-muted-foreground/20 bg-muted">
          {(auction.player_photo_url || auction.player_id) && (
            <img
              src={getPlayerImageUrl(
                auction.player_id,
                auction.player_photo_url,
                auction.player_name,
                auction.player_team
              )}
              alt={auction.player_name}
              className="h-full w-full object-cover object-top"
              style={{
                objectPosition: "50% 15%",
              }}
              onError={(e) => {
                const target = e.currentTarget;
                const cleanUrl = (url: string) => url?.split("?")[0]?.split("#")[0];
                const fantaUrl =
                  auction.player_id && getFantacalcioImageUrl(auction.player_id);
                const teamLogo = getTeamLogoUrl(auction.player_team || "");

                const currentSrc = cleanUrl(target.src);
                const safeFantaUrl = fantaUrl ? cleanUrl(fantaUrl) : null;
                const safeTeamLogo = teamLogo ? cleanUrl(teamLogo) : null;

                if (fantaUrl && currentSrc !== safeFantaUrl && target.src !== fantaUrl) {
                  target.src = fantaUrl;
                } else if (teamLogo && currentSrc !== safeTeamLogo && target.src !== teamLogo) {
                  target.src = teamLogo;
                  target.style.objectPosition = "center";
                  target.className = "h-full w-full object-contain p-1";
                  target.onerror = () => {
                    target.style.display = "none";
                    target.nextElementSibling?.classList.remove("hidden");
                  };
                } else {
                  target.style.display = "none";
                  target.nextElementSibling?.classList.remove("hidden");
                }
              }}
            />
          )}
          <div
            className={`flex h-full w-full items-center justify-center ${auction.player_photo_url || auction.player_id ? "hidden" : ""
              }`}
          >
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <div
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${roleColor} ${timeInfo.remaining < 60 ? "animate-pulse" : ""}`}
        />
        <span className="truncate text-sm font-medium">{auction.player_name}</span>
        {/* Quick bid icon - visible only to users who are NOT the highest bidder */}
        {onOpenBidModal && currentUserId && auction.current_highest_bidder_id !== currentUserId && (
          <button
            onClick={() => onOpenBidModal(auction.player_id)}
            className="ml-1 rounded p-0.5 transition-colors hover:bg-green-600/20"
            title={`Rilancia su ${auction.player_name}`}
          >
            <Gavel className="h-3.5 w-3.5 text-green-400 hover:text-green-300" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          {showUserAutoBid && (
            <span className="font-mono font-semibold text-blue-400 tabular-nums">
              {playerAutoBid.max_amount}
            </span>
          )}
          {showUserAutoBid && <span className="text-gray-600">|</span>}
          <span className={`font-mono font-semibold tabular-nums ${flash ? "scale-110 text-green-300" : "text-green-400"} transition-all duration-300`}>
            {auction.current_highest_bid_amount || 0}
          </span>
        </div>
        <span
          className={`ml-2 font-mono tabular-nums ${timeInfo.color} ${timeInfo.color === "text-red-500" && timeInfo.text.includes("s") ? "animate-pulse font-bold" : ""}`}
        >
          {timeInfo.text}
        </span>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="group flex h-8 items-center justify-center rounded-md border border-dashed border-muted-foreground/20 bg-muted/5 transition-all hover:border-muted-foreground/40 hover:bg-muted/10">
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 transition-all group-hover:scale-125 group-hover:bg-muted-foreground/50" />
    </div>
  );
}

// Main Component
export const ManagerColumn: React.FC<ManagerColumnProps> = ({
  manager,
  isCurrentUser,
  isHighestBidder: _isHighestBidder,
  position = 0,
  leagueSlots,
  activeAuctions = [],
  autoBids = [], // Added autoBids prop
  userAutoBid,
  currentAuctionPlayerId,
  userAuctionStates = [],
  leagueId,
  leagueStatus,
  handlePlaceBid,
  complianceTimerStartAt,
  onPenaltyApplied,
  onPlayerDiscarded,
  onOpenBidModal,
  currentUserId,
}) => {




  const getTeamColor = (position: number) => {
    const colors = [
      "text-red-400",
      "text-blue-400",
      "text-green-400",
      "text-yellow-400",
      "text-purple-400",
      "text-pink-400",
      "text-orange-400",
      "text-cyan-400",
    ];
    return colors[(position - 1) % colors.length];
  };

  const getRoleCount = (role: string) => {
    const managerPlayers = manager.players || [];
    const assignedCount = managerPlayers.filter(
      (p) => p.role.toUpperCase() === role.toUpperCase()
    ).length;
    const activeAuctionCount = (activeAuctions || []).filter(
      (a) =>
        a.player_role.toUpperCase() === role.toUpperCase() &&
        a.current_highest_bidder_id === manager.user_id
    ).length;
    return assignedCount + activeAuctionCount;
  };

  const createSlotsForRole = (role: string): Slot[] => {
    if (!leagueSlots) return [];

    const roleKey = `slots_${role}` as keyof LeagueSlots;
    const totalSlots = leagueSlots[roleKey];

    const managerPlayers = manager.players || [];
    const assignedPlayers = managerPlayers.filter(
      (p) => p.role.toUpperCase() === role.toUpperCase()
    );
    const activeAuctionsForRole = activeAuctions.filter(
      (a) =>
        a.player_role.toUpperCase() === role.toUpperCase() &&
        a.current_highest_bidder_id === manager.user_id
    );
    const statesForRole = userAuctionStates.filter((s) => {
      const auction = activeAuctions.find((a) => a.player_id === s.player_id);
      const matches = auction?.player_role.toUpperCase() === role.toUpperCase() &&
        s.user_state === "rilancio_possibile";


      return matches;
    });

    // Create slot items with a timestamp for sorting
    const allItems: { slot: Slot; timestamp: number }[] = [];

    assignedPlayers.forEach((player) => {
      // Use assigned_at if available, otherwise fallback to 0 (old items first)
      const ts = player.assigned_at || 0;
      allItems.push({ slot: { type: "assigned", player }, timestamp: ts });
    });

    statesForRole.forEach((state) => {
      allItems.push({ slot: { type: "response_needed", state }, timestamp: Date.now() });
    });

    activeAuctionsForRole.forEach((auction) => {
      const hasResponseState =
        isCurrentUser &&
        statesForRole.some((s) => s.player_id === auction.player_id);

      if (!hasResponseState) {
        // active auctions effectively have "now" + epsilon
        allItems.push({ slot: { type: "in_auction", auction }, timestamp: Date.now() + 1000 });
      }
    });

    // Sort by timestamp ascending
    allItems.sort((a, b) => a.timestamp - b.timestamp);

    const slots: Slot[] = allItems.map((i) => i.slot);

    while (slots.length < totalSlots) {
      slots.push({ type: "empty" });
    }

    return slots;
  };

  const totalBudget = manager?.total_budget || 0;
  const currentBudget = manager?.current_budget || 0;
  const rawLockedCredits = manager?.locked_credits || 0;
  const totalPenalties = manager?.total_penalties || 0;

  // Validazioni per prevenire valori negativi e NaN
  const lockedCredits = Math.max(
    0,
    isNaN(rawLockedCredits) ? 0 : rawLockedCredits
  );
  const validTotalBudget = isNaN(totalBudget) ? 0 : totalBudget;
  const validCurrentBudget = isNaN(currentBudget) ? 0 : currentBudget;
  const validTotalPenalties = isNaN(totalPenalties) ? 0 : totalPenalties;

  // Calcolo crediti spesi per giocatori assegnati (esclude penalità)
  const assignedPlayersCredits = manager.players.reduce(
    (sum, player) => sum + (player.assignment_price || 0),
    0
  );

  // NUOVO: Calcolo offerte vincenti correnti (TUTTE le aste dove sei il miglior offerente)
  const currentWinningBidsAmount = (activeAuctions || [])
    .filter((auction) => auction.current_highest_bidder_id === manager.user_id)
    .reduce((sum, auction) => sum + (auction.current_highest_bid_amount || 0), 0);

  // NUOVE FORMULE BUDGET
  // 1. SPESI = Giocatori assegnati + Penalità
  const spesi = assignedPlayersCredits + validTotalPenalties;

  // 2. AUTO-BID = Somma max_amount auto-bid attivi (locked_credits)
  const autoBid = lockedCredits;

  // 3. DISPONIBILI = Totale - Spesi - Offerte vincenti correnti
  const disponibili = Math.max(
    0,
    validTotalBudget - spesi - currentWinningBidsAmount
  );

  // 4. DISP. AUTO-BID = Totale - Spesi - Auto-bid
  const dispAutoBid = Math.max(0, validTotalBudget - spesi - autoBid);

  // Per altri utenti: RESIDUO = Totale - Spesi - Offerte vincenti correnti
  // (stessa formula di DISPONIBILI, per mostrare il budget realmente disponibile)
  const residuo = Math.max(0, validTotalBudget - spesi - currentWinningBidsAmount);

  // Legacy: manteniamo per compatibilità
  const spentCredits = spesi;
  const availableBudget = disponibili;
  const spentPercentage =
    validTotalBudget > 0 ? (spesi / validTotalBudget) * 100 : 0;

  // Header Gradient based on status
  const headerGradient = isCurrentUser
    ? "bg-gradient-to-r from-green-100 to-transparent dark:from-green-600/30"
    : "bg-gradient-to-r from-gray-100 to-transparent dark:from-gray-700/40";

  const borderColor = isCurrentUser
    ? complianceTimerStartAt !== undefined &&
      complianceTimerStartAt !== null &&
      !isNaN(complianceTimerStartAt) &&
      complianceTimerStartAt >= 0
      ? "border-red-400 dark:border-red-500/50"
      : "border-green-400 dark:border-green-500/50"
    : "border-gray-200 dark:border-gray-800";


  // Calculate stats
  const roleCounts = {
    P: manager.players.filter((p) => p.role === "P").length,
    D: manager.players.filter((p) => p.role === "D").length,
    C: manager.players.filter((p) => p.role === "C").length,
    A: manager.players.filter((p) => p.role === "A").length,
  };

  // Calculate missing players per role
  const missingRoles = {
    P: Math.max(0, (leagueSlots?.slots_P || 0) - roleCounts.P),
    D: Math.max(0, (leagueSlots?.slots_D || 0) - roleCounts.D),
    C: Math.max(0, (leagueSlots?.slots_C || 0) - roleCounts.C),
    A: Math.max(0, (leagueSlots?.slots_A || 0) - roleCounts.A),
  };

  return (
    <div
      className={`flex h-full flex-col rounded-xl border bg-card shadow-sm transition-all duration-300 hover:shadow-md dark:bg-card/50 ${borderColor}`}
    >
      {/* Header */}
      <div className={`-mx-px -mt-px mb-3 flex items-center justify-between gap-2 rounded-t-xl p-3 ${headerGradient}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isCurrentUser ? (
            <Star className="h-4 w-4 flex-shrink-0 text-yellow-400 fill-yellow-400" />
          ) : (
            <User className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          )}
          <span
            className={`truncate text-sm font-bold tracking-tight ${getTeamColor(
              position
            )}`}
          >
            {manager.manager_team_name || `Team #${position}`}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* Penalty indicator - visible to all if penalties exist */}
            {manager.total_penalties > 0 && !isNaN(manager.total_penalties) && (
              <span
                title={`Penalità totali: ${manager.total_penalties} crediti`}
                className="flex items-center"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                  P
                </div>
                <span className="ml-1 text-xs font-mono text-red-400">
                  {manager.total_penalties}
                </span>
              </span>
            )}

            {/* Compliance timer - visible only to current user */}
            {isCurrentUser && (
              <>
                {complianceTimerStartAt !== undefined &&
                  complianceTimerStartAt !== null &&
                  !isNaN(complianceTimerStartAt) &&
                  complianceTimerStartAt >= 0 ? (
                  <span title="Team non conforme" className="flex items-center">
                    <AlertTriangle className="ml-1 h-4 w-4 text-orange-400" />
                    <ComplianceTimer
                      timerStartTimestamp={complianceTimerStartAt}
                      leagueId={leagueId}
                      onPenaltyApplied={() => {
                        console.log(
                          "[MANAGER_COLUMN] Timer expired, penalty applied - refreshing compliance data"
                        );
                        if (onPenaltyApplied) {
                          onPenaltyApplied();
                        }
                      }}
                    />
                  </span>
                ) : (
                  <span title="Team conforme">
                    <CheckCircle className="ml-1 h-4 w-4 text-green-500" />
                  </span>
                )}
              </>
            )}

            {/* Total Budget (Admin Set) - Moved to far right */}
            <span
              className="rounded-sm bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
              title="Budget Iniziale (impostato dall'admin)"
            >
              {validTotalBudget}
            </span>
          </div>
        </div>
      </div>

      {/* Compact Budget Dashboard */}
      {isCurrentUser ? (
        /* Dashboard per utente corrente: 4 colonne */
        <div className="mb-4 grid grid-cols-4 gap-1.5 px-1">
          {/* DISPONIBILI */}
          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Disp.
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-muted-foreground/70 hover:text-foreground" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">💰 Crediti Disponibili</h4>
                    <p>Crediti che puoi spendere subito se nessuno rilancia sulle tue offerte attuali.</p>
                    <div className="rounded bg-muted p-2 dark:bg-muted/50">
                      <span className="font-mono text-[10px] font-semibold">Formula:</span>
                      <p className="font-mono text-[10px]">Budget Totale - Spesi - Offerte Vincenti Correnti</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {disponibili}
            </span>
          </div>

          {/* SPESI */}
          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Spesi
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-muted-foreground/70 hover:text-foreground" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">💸 Crediti Spesi</h4>
                    <p>Crediti definitivamente utilizzati per giocatori già assegnati e penalità applicate.</p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
              {spesi}
            </span>
          </div>

          {/* DISP. AUTO-BID (privato) */}
          <div className="flex flex-col items-center rounded-lg bg-amber-50/50 p-2 transition-colors hover:bg-amber-100/50 dark:bg-amber-900/10 dark:hover:bg-amber-900/20">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-500">
                Disp. A-Bid
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-amber-700/70 hover:text-amber-900 dark:text-amber-500/70 dark:hover:text-amber-300" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">🎯 Disponibili con Auto-Bid</h4>
                    <p>
                      Crediti realmente disponibili considerando il massimo impegnato nei tuoi auto-bid
                      attivi.
                    </p>
                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <span className="text-[10px]">⚠️</span>
                      <span className="text-[10px] font-medium">Visibile solo a te</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-amber-700 dark:text-amber-400">
              {dispAutoBid}
            </span>
          </div>

          {/* BLOCCATI (privato) */}
          <div className="flex flex-col items-center rounded-lg bg-blue-50/50 p-2 transition-colors hover:bg-blue-100/50 dark:bg-blue-900/10 dark:hover:bg-blue-900/20">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[9px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-500">
                Bloccati
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-blue-700/70 hover:text-blue-900 dark:text-blue-500/70 dark:hover:text-blue-300" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">🔒 Crediti Bloccati</h4>
                    <p>Crediti impegnati per le tue offerte attive e auto-bid.</p>
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <span className="text-[10px]">⚠️</span>
                      <span className="text-[10px] font-medium">Visibile solo a te</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
              {autoBid}
            </span>
          </div>
        </div>
      ) : (
        /* Dashboard per altri utenti: 2 colonne */
        <div className="mb-4 grid grid-cols-2 gap-2 px-1">
          {/* RESIDUO */}
          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Residuo
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-muted-foreground/70 hover:text-foreground" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">💰 Crediti Disponibili</h4>
                    <p>Crediti che puoi spendere subito se nessuno rilancia sulle tue offerte attuali.</p>
                    <div className="rounded bg-muted p-2 dark:bg-muted/50">
                      <span className="font-mono text-[10px] font-semibold">Formula:</span>
                      <p className="font-mono text-[10px]">Budget Totale - Spesi - Offerte Vincenti Correnti</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {residuo}
            </span>
          </div>

          {/* SPESI */}
          <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2 transition-colors hover:bg-muted">
            <div className="mb-1 flex items-center gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Spesi
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3 w-3 cursor-pointer text-muted-foreground/70 hover:text-foreground" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 text-xs" side="bottom">
                  <div className="space-y-2">
                    <h4 className="font-semibold">💸 Crediti Spesi</h4>
                    <p>Crediti definitivamente utilizzati per giocatori già assegnati e penalità applicate.</p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <span className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
              {spesi}
            </span>
          </div>
        </div>
      )}

      {/* Role counters */}
      <div className="mb-2 flex justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-gray-700 dark:text-gray-500">
        {["P", "D", "C", "A"].map((role) => {
          const currentCount = getRoleCount(role);
          const requiredSlots =
            leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0;
          const isCompliant = currentCount >= Math.max(0, requiredSlots - 1);
          return (
            <span
              key={role}
              className={`${isCompliant ? "text-green-500 font-bold" : "text-red-500 font-bold"}`}
            >
              {role} <span className={isCompliant ? "text-green-400" : "text-red-400"}>{currentCount}/{requiredSlots}</span>
            </span>
          );
        })}
      </div>

      {/* Slots list */}
      <div className="scrollbar-hide flex flex-1 flex-col space-y-1 overflow-y-auto">
        {["P", "D", "C", "A"].map((role) => {
          const slots = createSlotsForRole(role);
          if (slots.length === 0) return null;

          return (
            <div key={role} className="flex flex-col space-y-1">
              {slots.map((slot, idx) => {
                const isLast = idx === slots.length - 1;

                if (slot.type === "assigned") {
                  return (
                    <AssignedSlot
                      key={`assigned-${slot.player.id}`}
                      player={slot.player}
                      role={role}
                      isCurrentUser={isCurrentUser}
                      leagueStatus={leagueStatus}
                      leagueId={leagueId}
                      onPlayerDiscarded={onPlayerDiscarded}
                    />
                  );
                } else if (slot.type === "response_needed") {
                  return (
                    <ResponseNeededSlot
                      key={`response-${slot.state.player_id}`}
                      state={slot.state}
                      role={role}
                      leagueId={leagueId || 0}
                      isLast={isLast}
                      onCounterBid={onOpenBidModal ? () => onOpenBidModal(slot.state.player_id) : () => { }}
                      isCurrentUser={isCurrentUser}
                    />
                  );
                } else if (slot.type === "in_auction") {
                  return (
                    <InAuctionSlot
                      key={`auction-${slot.auction.player_id}`}
                      auction={slot.auction}
                      role={role}
                      isLast={isLast}
                      isCurrentUser={isCurrentUser}
                      leagueId={leagueId}
                      currentUserId={currentUserId}
                      onOpenBidModal={onOpenBidModal}
                    />
                  );
                } else {
                  return <EmptySlot key={`empty-${role}-${idx}`} />;
                }
              })}
            </div>
          );
        })}
      </div>
    </div >
  );
};

export const MemoizedManagerColumn = memo(ManagerColumn);
