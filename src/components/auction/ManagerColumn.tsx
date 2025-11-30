"use client";

import React, { useEffect, useState } from "react";

import {
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Lock,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ComplianceTimer } from "./ComplianceTimer";
import { DiscardPlayerModal } from "./DiscardPlayerModal";
import { ResponseActionModal } from "./ResponseActionModal";
import { StandardBidModal } from "./StandardBidModal";

// Type definitions
interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
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

// Alias for compatibility with shared types
type ManagerWithRoster = Manager;

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

// Alias for compatibility with shared types
type UserAuctionStateDetail = UserAuctionState;

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
  | { type: "response_needed"; state: UserAuctionState }
  | { type: "empty" };

interface AutoBidCount {
  player_id: number;
  auto_bid_count: number;
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

const formatTimeRemaining = (endTime: number) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, endTime - now);

  if (remaining === 0) return { text: "Scaduto", color: "text-red-500" };

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  let color = "text-foreground";
  let text = "";

  if (remaining < 300) {
    color = "text-red-500";
    text = remaining < 60 ? `${seconds}s` : `${minutes}m`;
  } else if (remaining < 3600) {
    color = "text-orange-400";
    text = `${minutes}m`;
  } else {
    text = `${hours}h ${minutes}m`;
  }

  return { text, color };
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

  // Show trash icon only if current user and league is in repair mode
  const showDiscardOption = isCurrentUser && leagueStatus === "repair_active";

  // Classi esplicite per ogni ruolo
  let bgClass = "bg-gray-700";
  let borderClass = "border-gray-700";

  switch (role.toUpperCase()) {
    case "P":
      bgClass = "bg-yellow-600 bg-opacity-20";
      borderClass = "border-yellow-500";
      break;
    case "D":
      bgClass = "bg-green-600 bg-opacity-20";
      borderClass = "border-green-500";
      break;
    case "C":
      bgClass = "bg-blue-600 bg-opacity-20";
      borderClass = "border-blue-500";
      break;
    case "A":
      bgClass = "bg-red-600 bg-opacity-20";
      borderClass = "border-red-500";
      break;
  }

  return (
    <>
      <div
        className={`flex items-center justify-between rounded-md p-1.5 ${bgClass} border ${borderClass}`}
      >
        <div className="flex min-w-0 items-center">
          <div
            className={`mr-1.5 h-4 w-4 flex-shrink-0 rounded-sm ${roleColor}`}
          />
          <span className="truncate text-xs">{player.name}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <span className="text-xs font-semibold text-foreground">
            {player.assignment_price}
          </span>
          {showDiscardOption ? (
            <button
              onClick={() => setShowDiscardModal(true)}
              className="rounded p-1 transition-colors hover:bg-red-600"
              title="Scarta giocatore"
            >
              <Trash2 className="h-3 w-3 text-red-400" />
            </button>
          ) : (
            <Lock className="h-3 w-3 text-gray-400" />
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
  isCurrentUser, // Add this prop
}: {
  state: UserAuctionState;
  role: string;
  leagueId: number;
  isLast: boolean;
  onCounterBid: (playerId: number) => void;
  isCurrentUser: boolean; // Add this prop
}) {
  const [showModal, setShowModal] = useState(false);
  const [currentTimeRemaining, setCurrentTimeRemaining] = useState(
    state.time_remaining || 0
  );

  const roleColor = getRoleColor(role);

  // Response timer countdown effect
  useEffect(() => {
    if (!state.time_remaining || state.time_remaining <= 0) {
      setCurrentTimeRemaining(0);
      return;
    }

    setCurrentTimeRemaining(state.time_remaining);

    const interval = setInterval(() => {
      setCurrentTimeRemaining((prev) => {
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
    if (seconds <= 0) return "Scaduto";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get timer color based on remaining time
  const getTimerColor = (seconds: number) => {
    if (seconds <= 0) return "text-red-500";
    if (seconds <= 300) return "text-red-400"; // Under 5 minutes: red
    if (seconds <= 1800) return "text-yellow-400"; // Under 30 minutes: yellow
    return "text-green-400"; // Over 30 minutes: green
  };

  return (
    <>
      <div
        className={`flex items-center justify-between border border-red-500 bg-red-600 bg-opacity-30 p-1.5 ${isLast ? "rounded-b-md" : ""}`}
      >
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className={`mr-1.5 h-4 w-4 flex-shrink-0 rounded-sm ${roleColor}`}
          />
          <span className="mr-2 truncate text-xs text-red-900 dark:text-red-200">
            {state.player_name}
          </span>
          {/* Response Timer */}
          {currentTimeRemaining > 0 ? (
            <span
              className={`font-mono text-xs font-bold ${getTimerColor(currentTimeRemaining)} ${currentTimeRemaining <= 300 ? "animate-pulse" : ""}`}
            >
              {formatResponseTimer(currentTimeRemaining)}
            </span>
          ) : (
            <span className="text-xs font-bold text-red-500">Scaduto</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-foreground">{state.current_bid}</span>
          <button
            onClick={() => onCounterBid(state.player_id)}
            className="rounded p-1 transition-colors hover:bg-green-600"
            title="Rilancia"
            disabled={currentTimeRemaining <= 0 || !isCurrentUser} // Disable if not current user
          >
            <DollarSign
              className={`h-3 w-3 ${currentTimeRemaining <= 0 || !isCurrentUser ? "text-gray-500" : "text-green-400"}`}
            />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="rounded p-1 transition-colors hover:bg-red-600"
            title="Abbandona"
            disabled={currentTimeRemaining <= 0 || !isCurrentUser} // Disable if not current user
          >
            <X
              className={`h-3 w-3 ${currentTimeRemaining <= 0 || !isCurrentUser ? "text-gray-500" : "text-red-400"}`}
            />
          </button>
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
}: {
  auction: ActiveAuction;
  role: string;
  isLast: boolean;
  isCurrentUser: boolean;
  leagueId?: number;
}) {
  const [playerAutoBid, setPlayerAutoBid] = useState<{
    max_amount: number;
    is_active: boolean;
  } | null>(null);

  const timeInfo = formatTimeRemaining(auction.scheduled_end_time);
  const roleColor = getRoleColor(role);

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
    // REMOVED: auction.current_highest_bid_amount - this was causing unnecessary re-fetches
  ]);

  // Show user's auto-bid for this specific player (only their own)
  const showUserAutoBid =
    isCurrentUser && playerAutoBid && playerAutoBid.is_active;

  // Classi esplicite per ogni ruolo
  let bgClass = "bg-gray-700";
  let borderClass = "border-gray-700";

  switch (role.toUpperCase()) {
    case "P":
      bgClass = "bg-yellow-600 bg-opacity-20";
      borderClass = "border-yellow-500";
      break;
    case "D":
      bgClass = "bg-green-600 bg-opacity-20";
      borderClass = "border-green-500";
      break;
    case "C":
      bgClass = "bg-blue-600 bg-opacity-20";
      borderClass = "border-blue-500";
      break;
    case "A":
      bgClass = "bg-red-600 bg-opacity-20";
      borderClass = "border-red-500";
      break;
  }

  return (
    <div
      className={`flex items-center justify-between p-1.5 ${bgClass} border ${borderClass} ${isLast ? "rounded-b-md" : ""}`}
    >
      <div className="flex min-w-0 items-center">
        <div
          className={`mr-1.5 h-4 w-4 flex-shrink-0 rounded-sm ${roleColor}`}
        />
        <span className="truncate text-xs">{auction.player_name}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {showUserAutoBid && (
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {playerAutoBid.max_amount}
            </span>
          )}
          {showUserAutoBid && <span className="text-gray-400">|</span>}
          <span className={`font-semibold text-green-600 dark:text-green-400`}>
            {auction.current_highest_bid_amount || 0}
          </span>
        </div>
        <span
          className={`ml-2 ${timeInfo.color} ${timeInfo.color === "text-red-500" && timeInfo.text.includes("s") ? "animate-pulse" : ""}`}
        >
          {timeInfo.text}
        </span>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center justify-between rounded-md border border-dashed border-gray-500 bg-gray-600 bg-opacity-20 p-1.5">
      <div className="flex min-w-0 items-center">
        <div className="mr-1.5 h-4 w-4 flex-shrink-0 rounded-sm bg-gray-500 opacity-50" />
        <span className="truncate text-xs">Slot vuoto</span>
      </div>
      <span className="text-xs font-semibold text-gray-500">-</span>
    </div>
  );
}

// Main Component
const ManagerColumn: React.FC<ManagerColumnProps> = ({
  manager,
  isCurrentUser,
  isHighestBidder: _isHighestBidder,
  position = 0,
  leagueSlots,
  activeAuctions = [],
  userAutoBid,
  currentAuctionPlayerId,
  userAuctionStates = [],
  leagueId,
  leagueStatus,
  handlePlaceBid,
  complianceTimerStartAt,
  onPenaltyApplied,
  onPlayerDiscarded,
}) => {
  const [showStandardBidModal, setShowStandardBidModal] = useState(false);
  const [selectedPlayerForBid, setSelectedPlayerForBid] = useState<{
    id: number;
    name: string;
    role: string;
    team: string;
    currentBid: number;
  } | null>(null);

  const handleCounterBid = (playerId: number) => {
    console.log(`[ManagerColumn] Counter bid clicked for player ${playerId}`);

    const auction = activeAuctions.find((a) => a.player_id === playerId);
    const state = userAuctionStates.find((s) => s.player_id === playerId);

    if (auction || state) {
      setSelectedPlayerForBid({
        id: playerId,
        name: auction?.player_name || state?.player_name || "Giocatore",
        role: auction?.player_role || "?",
        team: auction?.player_team || "?",
        currentBid:
          auction?.current_highest_bid_amount || state?.current_bid || 0,
      });
      setShowStandardBidModal(true);
    }
  };

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
      return (
        auction?.player_role.toUpperCase() === role.toUpperCase() &&
        s.user_state === "rilancio_possibile"
      );
    });

    const slots: Slot[] = [];
    assignedPlayers.forEach((player) =>
      slots.push({ type: "assigned", player })
    );
    statesForRole.forEach((state) => {
      slots.push({ type: "response_needed", state });
    });
    activeAuctionsForRole.forEach((auction) => {
      const hasResponseState =
        isCurrentUser &&
        statesForRole.some((s) => s.player_id === auction.player_id);
      if (!hasResponseState) {
        slots.push({ type: "in_auction", auction });
      }
    });

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

  // FIX: Use comprehensive calculation to handle database inconsistencies
  // Available = Initial - Penalties - Spent - Locked
  const spentCredits = Math.max(0, validTotalBudget - validCurrentBudget);
  const availableBudget = Math.max(
    0,
    validTotalBudget - validTotalPenalties - spentCredits - lockedCredits
  );
  const spentPercentage =
    validTotalBudget > 0 ? (spentCredits / validTotalBudget) * 100 : 0;

  return (
    <div
      className={`flex h-full flex-col rounded-lg border-2 bg-card p-2 ${isCurrentUser
        ? complianceTimerStartAt !== undefined &&
          complianceTimerStartAt !== null &&
          !isNaN(complianceTimerStartAt) &&
          complianceTimerStartAt >= 0
          ? "border-red-500"
          : "border-green-500"
        : "border-border"
        }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {isCurrentUser ? (
            <Star className="h-4 w-4 flex-shrink-0 text-yellow-400" />
          ) : (
            <User className="h-4 w-4 flex-shrink-0 text-gray-400" />
          )}
          <span
            className={`truncate text-xs font-semibold ${getTeamColor(
              position
            )}`}
          >
            {manager.manager_team_name || `Team #${position}`}
          </span>

          {/* Compliance Status - Visible to all users */}
          <div className="flex items-center gap-1">
            {/* Penalty indicator - visible to all if penalties exist */}
            {manager.total_penalties > 0 && !isNaN(manager.total_penalties) && (
              <span
                title={`Penalità totali: ${manager.total_penalties} crediti`}
                className="flex items-center"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                  P
                </div>
                <span className="ml-1 text-xs text-red-400">
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
                        // Call parent callback to refresh data after penalty
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
          </div>
        </div>
      </div>

      {/* Nuovo Cruscotto Budget */}
      <div className="mb-2 space-y-2 rounded-md border border-gray-700 bg-gray-800/50 p-2 text-xs">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-gray-300">DISPONIBILI</span>
          <span className="text-lg font-bold text-green-400">
            {availableBudget}
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-gray-600">
          <div
            className="h-2 rounded-full bg-red-500"
            style={{ width: `${spentPercentage}%` }}
            title={`Speso: ${spentPercentage.toFixed(1)}%`}
          ></div>
        </div>

        <div className="flex justify-between pt-1 text-center">
          <div>
            <span className="text-gray-400">Bloccati</span>
            <span className="block font-semibold text-orange-400">
              {lockedCredits}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Spesi</span>
            <span className="block font-semibold text-red-400">
              {spentCredits}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Iniziale</span>
            <span className="block font-semibold">{validTotalBudget}</span>
          </div>
        </div>
      </div>

      {/* Role counters */}
      <div className="mb-2 flex justify-around text-xs">
        {["P", "D", "C", "A"].map((role) => {
          const currentCount = getRoleCount(role);
          const requiredSlots =
            leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0;
          const isCompliant = currentCount >= Math.max(0, requiredSlots - 1);
          return (
            <span
              key={role}
              className={isCompliant ? "text-green-400" : "text-red-400"}
            >
              {role}: {currentCount}
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
            <div key={role} className="flex flex-col">
              <div
                className={`${getRoleColor(role)} px-2 py-1 text-gray-900 ${slots.some((s) => s.type === "in_auction") ? "rounded-t-md" : "mb-1 rounded-md"} flex items-center justify-between text-xs font-semibold`}
              >
                <span>{role}</span>
                <span>
                  {
                    (manager.players || []).filter(
                      (p) => p.role.toUpperCase() === role.toUpperCase()
                    ).length
                  }
                  /{leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0}
                </span>
              </div>

              <div className="space-y-0.5">
                {slots.map((slot, index) => {
                  switch (slot.type) {
                    case "assigned":
                      return (
                        <AssignedSlot
                          key={index}
                          player={slot.player}
                          role={role}
                          isCurrentUser={isCurrentUser}
                          leagueStatus={leagueStatus}
                          leagueId={leagueId}
                          onPlayerDiscarded={onPlayerDiscarded}
                        />
                      );
                    case "in_auction":
                      return (
                        <InAuctionSlot
                          key={index}
                          auction={slot.auction}
                          role={role}
                          isLast={index === slots.length - 1}
                          isCurrentUser={isCurrentUser}
                          leagueId={leagueId}
                        />
                      );
                    case "response_needed":
                      return (
                        <ResponseNeededSlot
                          key={index}
                          state={slot.state}
                          role={role}
                          leagueId={
                            leagueId ||
                            parseInt(window.location.pathname.split("/")[2])
                          } // Extract from URL
                          isLast={index === slots.length - 1}
                          onCounterBid={handleCounterBid}
                          isCurrentUser={isCurrentUser} // Pass isCurrentUser prop
                        />
                      );
                    case "empty":
                      return <EmptySlot key={index} />;
                    default:
                      return null;
                  }
                })}
              </div>
            </div>
          );
        })}

        {!leagueSlots && (
          <div className="py-4 text-center text-xs text-gray-500">
            Configurazione slot non disponibile
          </div>
        )}
      </div>

      {/* Standard Bid Modal */}
      {selectedPlayerForBid && leagueId && (
        <StandardBidModal
          isOpen={showStandardBidModal}
          onClose={() => {
            setShowStandardBidModal(false);
            setSelectedPlayerForBid(null);
          }}
          playerName={selectedPlayerForBid.name}
          playerRole={selectedPlayerForBid.role}
          playerTeam={selectedPlayerForBid.team}
          playerId={selectedPlayerForBid.id}
          leagueId={leagueId}
          currentBid={selectedPlayerForBid.currentBid}
          isNewAuction={false}
          title="Rilancia"
          existingAutoBid={
            isCurrentUser && currentAuctionPlayerId === selectedPlayerForBid.id
              ? userAutoBid
              : null
          }
          onBidSuccess={async (amount, bidType, maxAmount) => {
            if (!isCurrentUser) {
              toast.error("Non sei autorizzato a gestire questa squadra.");
              setShowStandardBidModal(false);
              setSelectedPlayerForBid(null);
              return;
            }
            try {
              if (handlePlaceBid) {
                await handlePlaceBid(
                  amount,
                  bidType || "manual",
                  selectedPlayerForBid.id,
                  true, // Bypass compliance check for counter-bids
                  maxAmount
                );
              }
              setShowStandardBidModal(false);
              setSelectedPlayerForBid(null);
            } catch (error) {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : "Si è verificato un errore sconosciuto";
              console.error("Failed to place bid:", error);
              toast.error("Errore nel piazzare l'offerta", {
                description: errorMessage,
              });
              // Still close the modal
              setShowStandardBidModal(false);
              setSelectedPlayerForBid(null);
            }
          }}
        />
      )}
    </div>
  );
};

export const MemoizedManagerColumn = React.memo(ManagerColumn);
