"use client";

import React, { useEffect, useState } from "react";

import {
  DollarSign,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ComplianceTimer } from "./ComplianceTimer";
import { ResponseActionModal } from "./ResponseActionModal";
import { StandardBidModal } from "./StandardBidModal";

// Type definitions
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

interface AutoBid {
  player_id: number;
  max_amount: number;
  is_active: boolean;
  user_id: string; // Added user_id to identify the owner of the auto-bid
}

// Discriminated union for Slot
type Slot =
  | { type: "assigned"; player: PlayerInRoster }
  | { type: "in_auction"; player: PlayerInRoster }
  | { type: "response_needed"; player: PlayerInRoster }
  | { type: "empty" };

interface ManagerColumnProps {
  manager: Manager;
  isCurrentUser: boolean;
  isHighestBidder: boolean;
  position: number;
  leagueSlots?: LeagueSlots;
  activeAuctions?: ActiveAuction[];
  autoBids?: AutoBid[]; // Changed from AutoBidIndicator[] to AutoBid[]
  userAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
  currentAuctionPlayerId?: number;
  userAuctionStates?: UserAuctionState[];
  leagueId?: number;
  onComplianceChange?: (status: {
    isCompliant: boolean;
    isInGracePeriod: boolean;
  }) => void;
  handlePlaceBid: (
    amount: number,
    bidType?: "manual" | "quick",
    targetPlayerId?: number,
    bypassComplianceCheck?: boolean,
    maxAmount?: number
  ) => Promise<void>;
  complianceTimerStartAt: number | null;
  onPenaltyApplied?: () => void; // Callback for when penalty is applied
  userAutoBidOverlay?: Record<number, { max_amount: number; is_active: boolean }>;
  setUserAutoBidOverlay?: React.Dispatch<
    React.SetStateAction<Record<number, { max_amount: number; is_active: boolean }>>
  >;
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
}: {
  player: PlayerInRoster;
  role: string;
}) {
  const roleColor = getRoleColor(role);

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
      className={`flex items-center justify-between rounded-md p-1.5 ${bgClass} border ${borderClass}`}
    >
      <div className="flex min-w-0 items-center">
        <div
          className={`mr-1.5 h-4 w-4 flex-shrink-0 rounded-sm ${roleColor}`}
        ></div>
        <span className="truncate text-xs">{player.name}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <span className="text-xs font-semibold text-foreground">
          {player.assignment_price}
        </span>
        <Lock className="h-3 w-3 text-gray-400" />
      </div>
    </div>
  );
}

function ResponseNeededSlot({
  player,
  role,
  leagueId,
  isLast,
  onCounterBid,
  isCurrentUser, // Add this prop
  currentBid,
}: {
  player: PlayerInRoster;
  role: string;
  leagueId: number;
  isLast: boolean;
  onCounterBid: (playerId: number) => void;
  isCurrentUser: boolean; // Add this prop
  currentBid?: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const [currentTimeRemaining, setCurrentTimeRemaining] = useState(
    player.response_deadline
      ? player.response_deadline - Math.floor(Date.now() / 1000)
      : 0
  );

  const roleColor = getRoleColor(role);

  // Response timer countdown effect
  useEffect(() => {
    const deadline = player.response_deadline;
    if (!deadline) {
      setCurrentTimeRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, deadline - now);
      setCurrentTimeRemaining(remaining);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [player.response_deadline]);

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
          ></div>
          <span className="mr-2 truncate text-xs text-red-900 dark:text-red-200">
            {player.name}
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
          <span className="text-xs text-foreground">
            {currentBid ?? player.assignment_price}
          </span>
          <button
            onClick={() => onCounterBid(player.id)}
            className="rounded p-1 transition-colors hover:bg-green-600"
            title="Rilancia"
            disabled={currentTimeRemaining <= 0 || !isCurrentUser} // Disable if not current user
          >
            <DollarSign
              className={`h-3 w-3 ${currentTimeRemaining <= 0 || !isCurrentUser ? "text-gray-500" : "text-green-400"}`}
            ></DollarSign>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="rounded p-1 transition-colors hover:bg-red-600"
            title="Abbandona"
            disabled={currentTimeRemaining <= 0 || !isCurrentUser} // Disable if not current user
          >
            <X
              className={`h-3 w-3 ${currentTimeRemaining <= 0 || !isCurrentUser ? "text-gray-500" : "text-red-400"}`}
            ></X>
          </button>
        </div>
      </div>

      <ResponseActionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        playerName={player.name}
        currentBid={player.assignment_price}
        timeRemaining={currentTimeRemaining}
        leagueId={leagueId}
        playerId={player.id}
        onCounterBid={() => onCounterBid(player.id)}
      />
    </>
  );
}

function InAuctionSlot({
  player,
  role,
  isLast,
  isCurrentUser,
  leagueId,
  currentBid,
  scheduledEndTime,
  overlayAutoBidMaxAmount,
  overlayAutoBidIsActive,
}: {
  player: PlayerInRoster;
  role: string;
  isLast: boolean;
  isCurrentUser: boolean;
  leagueId?: number;
  currentBid?: number;
  scheduledEndTime?: number;
  overlayAutoBidMaxAmount?: number;
  overlayAutoBidIsActive?: boolean;
}) {
  const timeInfo = formatTimeRemaining((scheduledEndTime ?? player.scheduled_end_time) || 0);
  const roleColor = getRoleColor(role);

  // Show user's auto-bid for this specific player (only their own)
  const showUserAutoBid = isCurrentUser && (
    (overlayAutoBidIsActive && overlayAutoBidMaxAmount !== undefined && overlayAutoBidMaxAmount !== null) ||
    (player.user_auto_bid_is_active && player.user_auto_bid_max_amount !== null && player.user_auto_bid_max_amount !== undefined)
  );

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
        ></div>
        <span className="truncate text-xs">{player.name}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          {showUserAutoBid && (
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {overlayAutoBidIsActive && overlayAutoBidMaxAmount != null ? overlayAutoBidMaxAmount : player.user_auto_bid_max_amount}
            </span>
          )}
          {showUserAutoBid && <span className="text-gray-400">|</span>}
          <span className={`font-semibold text-green-600 dark:text-green-400`}>
            {currentBid ?? player.assignment_price ?? 0}
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
  isHighestBidder,
  position,
  leagueSlots,
  activeAuctions = [],
  userAutoBid,
  currentAuctionPlayerId,
  userAutoBidOverlay,
  setUserAutoBidOverlay,
  userAuctionStates = [],
  leagueId,
  handlePlaceBid,
  complianceTimerStartAt,
  onPenaltyApplied,
  onComplianceChange,
}) => {
  const [showStandardBidModal, setShowStandardBidModal] = useState(false);
  const [selectedPlayerForBid, setSelectedPlayerForBid] = useState<{
    id: number;
    name: string;
    role: string;
    team: string;
    currentBid: number;
  } | null>(null);

  const [complianceState, setComplianceState] = useState({
    isCompliant: true,
    isInGracePeriod: false,
    isPenaltyActive: false,
  });

  useEffect(() => {
    const now = Math.floor(Date.now() / 1000);
    const isTimerActive = complianceTimerStartAt !== null;

    if (!isTimerActive) {
      const newState = {
        isCompliant: true,
        isInGracePeriod: false,
        isPenaltyActive: false,
      };
      setComplianceState(newState);
      if (onComplianceChange) {
        onComplianceChange({
          isCompliant: newState.isCompliant,
          isInGracePeriod: newState.isInGracePeriod,
        });
      }
      return;
    }

    const gracePeriodEnds = complianceTimerStartAt + 3600; // 1 hour
    const isInGracePeriod = now < gracePeriodEnds;

    const newState = {
      isCompliant: false,
      isInGracePeriod: isInGracePeriod,
      isPenaltyActive: !isInGracePeriod,
    };
    setComplianceState(newState);
    if (onComplianceChange) {
      onComplianceChange({
        isCompliant: newState.isCompliant,
        isInGracePeriod: newState.isInGracePeriod,
      });
    }
  }, [complianceTimerStartAt, onComplianceChange]);

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
    const slots: Slot[] = [];

    const playersForRole = (manager.players || []).filter(
      (p) => p.role.toUpperCase() === role.toUpperCase()
    );

    // Prepara un set dei player in stato di risposta necessaria per l'utente corrente
    const responseNeededSet = new Set<number>(
      (isCurrentUser ? (userAuctionStates || []) : [])
        .filter((s) => s.user_state === "rilancio_possibile")
        .map((s) => s.player_id)
    );

    playersForRole.forEach((player) => {
      // Se l'utente corrente non è più il miglior offerente su un player marcato come "winning"
      // e ha stato 'rilancio_possibile', trasformiamo lo slot in "response_needed" senza rifare il fetch.
      if (isCurrentUser && player.player_status === "winning" && responseNeededSet.has(player.id)) {
        const s = (userAuctionStates || []).find((st) => st.player_id === player.id);
        const aa = (activeAuctions || []).find((a) => a.player_id === player.id);
        const syntheticPlayer: PlayerInRoster = {
          ...player,
          assignment_price: s?.current_bid ?? player.assignment_price,
          player_status: "pending_decision",
          scheduled_end_time: aa?.scheduled_end_time ?? player.scheduled_end_time,
          response_deadline: s?.response_deadline ?? player.response_deadline ?? null,
        };
        slots.push({ type: "response_needed", player: syntheticPlayer });
        return;
      }

      switch (player.player_status) {
        case "assigned":
          slots.push({ type: "assigned", player });
          break;
        case "winning": {
          const aa = (activeAuctions || []).find((a) => a.player_id === player.id);
          if (aa && aa.current_highest_bidder_id === manager.user_id) {
            slots.push({ type: "in_auction", player });
          }
          break;
        }
        case "pending_decision":
          slots.push({ type: "response_needed", player });
          break;
      }
    });

    // Merge userAuctionStates to inject response-needed slots for current user without refetch
    if (isCurrentUser && (userAuctionStates || []).length > 0) {
      const statesForRole = (userAuctionStates || []).filter((s) => s.user_state === "rilancio_possibile");
      for (const s of statesForRole) {
        const aa = (activeAuctions || []).find((a) => a.player_id === s.player_id);
        if (!aa) continue;
        if (aa.player_role.toUpperCase() !== role.toUpperCase()) continue;
        const alreadyInRoster = playersForRole.some((p) => p.id === s.player_id);
        if (alreadyInRoster) continue;
        const syntheticPlayer: PlayerInRoster = {
          id: s.player_id,
          name: s.player_name,
          role: aa.player_role,
          team: aa.player_team,
          assignment_price: s.current_bid,
          player_status: "pending_decision",
          scheduled_end_time: aa.scheduled_end_time,
          response_deadline: s.response_deadline ?? null,
          user_auto_bid_max_amount: null,
          user_auto_bid_is_active: null,
        };
        slots.push({ type: "response_needed", player: syntheticPlayer });
      }
    }

    while (slots.length < totalSlots) {
      slots.push({ type: "empty" });
    }

    return slots;
  };

  const totalBudget = manager?.total_budget || 0;
  const currentBudget = manager?.current_budget || 0;
  const lockedCredits = manager?.locked_credits || 0;
  const availableBudget = currentBudget - lockedCredits;
  const spentCredits = totalBudget - availableBudget;
  const spentPercentage =
    totalBudget > 0 ? (spentCredits / totalBudget) * 100 : 0;

  const borderColorClass = complianceState.isCompliant
    ? "border-green-500"
    : "border-red-500";

  const ComplianceIcon = complianceState.isCompliant
    ? ShieldCheck
    : complianceState.isInGracePeriod
      ? ShieldAlert
      : Shield;

  return (
    <div
      className={`flex h-full flex-col rounded-lg border-2 bg-card p-2 ${borderColorClass}`}
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

          {/* Compliance Status */}
          <div className="flex items-center gap-1">
            {isCurrentUser && (
              <span
                title={
                  complianceState.isCompliant
                    ? "Team conforme"
                    : complianceState.isInGracePeriod
                      ? "Team non conforme (periodo di grazia)"
                      : "Team non conforme (penalità attive)"
                }
              >
                <ComplianceIcon
                  className={`ml-1 h-4 w-4 ${
                    complianceState.isCompliant
                      ? "text-green-500"
                      : complianceState.isInGracePeriod
                        ? "text-orange-400"
                        : "text-red-500"
                  }`}
                />
              </span>
            )}

            {isCurrentUser && complianceState.isInGracePeriod && (
              <ComplianceTimer
                timerStartTimestamp={complianceTimerStartAt}
                leagueId={leagueId}
                onPenaltyApplied={onPenaltyApplied}
              />
            )}

            {manager.total_penalties > 0 && (
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
          </div>
        </div>
        <div
          className={`text-lg font-bold ${isHighestBidder ? "text-green-400" : isCurrentUser ? "text-yellow-400" : "text-foreground"}`}
        >
          {manager.current_budget}
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
            <span className="block font-semibold">{totalBudget}</span>
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
                        />
                      );
                    case "in_auction":
                      return (
                        <InAuctionSlot
                          key={index}
                          player={slot.player}
                          role={role}
                          isLast={index === slots.length - 1}
                          isCurrentUser={isCurrentUser}
                          leagueId={leagueId}
                          currentBid={
                            (activeAuctions || []).find(
                              (a) => a.player_id === slot.player.id
                            )?.current_highest_bid_amount ??
                            slot.player.assignment_price
                          }
                          scheduledEndTime={
                            (activeAuctions || []).find(
                              (a) => a.player_id === slot.player.id
                            )?.scheduled_end_time ??
                            slot.player.scheduled_end_time ?? undefined
                          }
                          overlayAutoBidIsActive={
                            userAutoBidOverlay?.[slot.player.id]?.is_active
                          }
                          overlayAutoBidMaxAmount={
                            userAutoBidOverlay?.[slot.player.id]?.max_amount
                          }
                        />
                      );
                    case "response_needed":
                      return (
                        <ResponseNeededSlot
                          key={index}
                          player={slot.player}
                          role={role}
                          leagueId={
                            leagueId ||
                            parseInt(window.location.pathname.split("/")[2])
                          } // Extract from URL
                          isLast={index === slots.length - 1}
                          onCounterBid={handleCounterBid}
                          isCurrentUser={isCurrentUser} // Pass isCurrentUser prop
                          currentBid={
                            (activeAuctions || []).find(
                              (a) => a.player_id === slot.player.id
                            )?.current_highest_bid_amount ??
                            slot.player.assignment_price
                          }
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
              await handlePlaceBid(
                amount,
                bidType || "manual",
                selectedPlayerForBid.id,
                true, // Bypass compliance check for counter-bids
                maxAmount
              );
              // Overlay immediato (solo lato client) dello stato auto-bid per UX reattiva
              if (
                isCurrentUser &&
                typeof maxAmount === "number" &&
                setUserAutoBidOverlay
              ) {
                setUserAutoBidOverlay((prev) => ({
                  ...(prev || {}),
                  [selectedPlayerForBid.id]: {
                    max_amount: maxAmount,
                    is_active: maxAmount > 0,
                  },
                }));
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
