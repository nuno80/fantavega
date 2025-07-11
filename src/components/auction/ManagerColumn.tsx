"use client";

import { Star, User, Lock, DollarSign, X } from "lucide-react";
import { useState } from "react";
import { ResponseActionModal } from "./ResponseActionModal";
import { BiddingInterface } from "./BiddingInterface";

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

interface ResponseTimer {
  auction_id: number;
  player_id: number;
  player_name: string;
  response_deadline: number;
  current_bid: number;
}

interface AutoBidIndicator {
  player_id: number;
  auto_bid_count: number;
}

// Discriminated union for Slot
type Slot =
  | { type: 'assigned'; player: PlayerInRoster }
  | { type: 'in_auction'; auction: ActiveAuction }
  | { type: 'response_needed'; timer: ResponseTimer }
  | { type: 'empty' };

interface ManagerColumnProps {
  manager: Manager;
  isCurrentUser: boolean;
  isHighestBidder: boolean;
  position: number;
  leagueSlots?: LeagueSlots;
  activeAuctions?: ActiveAuction[];
  autoBids?: AutoBidIndicator[];
  userAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null;
  currentAuctionPlayerId?: number;
  responseTimers?: ResponseTimer[];
}

// Helper functions
const getRoleColor = (role: string) => {
  switch (role.toUpperCase()) {
    case 'P': return 'bg-yellow-500';
    case 'D': return 'bg-green-500';
    case 'C': return 'bg-blue-500';
    case 'A': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

const getRoleTextColor = (role: string) => {
  switch (role.toUpperCase()) {
    case 'P': return 'text-yellow-400';
    case 'D': return 'text-green-400';
    case 'C': return 'text-blue-400';
    case 'A': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

const getSlotStyle = (role: string): React.CSSProperties => {
  const style: React.CSSProperties = {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderColor: '#6B7280',
    borderWidth: '1px',
    borderStyle: 'solid',
  };
  switch (role.toUpperCase()) {
    case 'P':
      style.backgroundColor = 'rgba(234, 179, 8, 0.2)';
      style.borderColor = '#F59E0B';
      break;
    case 'D':
      style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
      style.borderColor = '#10B981';
      break;
    case 'C':
      style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
      style.borderColor = '#3B82F6';
      break;
    case 'A':
      style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
      style.borderColor = '#EF4444';
      break;
  }
  return style;
};

const formatTimeRemaining = (endTime: number) => {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, endTime - now);

  if (remaining === 0) return { text: "Scaduto", color: "text-red-500" };

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  let color = "text-white";
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
function AssignedSlot({ player, role }: { player: PlayerInRoster; role: string }) {
  const roleColor = getRoleColor(role);
  const roleTextColor = getRoleTextColor(role);

  // Classi esplicite per ogni ruolo
  let bgClass = "bg-gray-700";
  let borderClass = "border-gray-700";
  
  switch (role.toUpperCase()) {
    case 'P':
      bgClass = "bg-yellow-600 bg-opacity-20";
      borderClass = "border-yellow-500";
      break;
    case 'D':
      bgClass = "bg-green-600 bg-opacity-20";
      borderClass = "border-green-500";
      break;
    case 'C':
      bgClass = "bg-blue-600 bg-opacity-20";
      borderClass = "border-blue-500";
      break;
    case 'A':
      bgClass = "bg-red-600 bg-opacity-20";
      borderClass = "border-red-500";
      break;
  }

  return (
    <div className={`p-1.5 flex items-center justify-between rounded-md ${bgClass} border ${borderClass}`}>
      <div className="flex items-center min-w-0">
        <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${roleColor}`} />
        <span className="text-xs truncate">{player.name}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs font-semibold text-white">
          {player.assignment_price}
        </span>
        <Lock className="h-3 w-3 text-gray-400" />
      </div>
    </div>
  );
}

function ResponseNeededSlot({
  timer,
  role,
  leagueId,
  isLast,
  onCounterBid
}: {
  timer: ResponseTimer;
  role: string;
  leagueId: number;
  isLast: boolean;
  onCounterBid: (playerId: number) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = Math.max(0, timer.response_deadline - now);
  
  const roleColor = getRoleColor(role);

  return (
    <>
      <div className={`p-1.5 flex items-center justify-between bg-red-600 bg-opacity-30 border border-red-500 ${isLast ? 'rounded-b-md' : ''}`}>
        <div className="flex items-center min-w-0">
          <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${roleColor}`} />
          <span className="text-xs truncate text-red-200">{timer.player_name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-red-200">{timer.current_bid}</span>
          <button
            onClick={() => onCounterBid(timer.player_id)}
            className="p-1 hover:bg-green-600 rounded transition-colors"
            title="Rilancia"
          >
            <DollarSign className="h-3 w-3 text-green-400" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="p-1 hover:bg-red-600 rounded transition-colors"
            title="Abbandona"
          >
            <X className="h-3 w-3 text-red-400" />
          </button>
        </div>
      </div>
      
      <ResponseActionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        playerName={timer.player_name}
        currentBid={timer.current_bid}
        timeRemaining={timeRemaining}
        leagueId={leagueId}
        playerId={timer.player_id}
        onCounterBid={() => onCounterBid(timer.player_id)}
      />
    </>
  );
}

function InAuctionSlot({ 
  auction, 
  role, 
  autoBids = [], 
  managerUserId, 
  isLast, 
  userAutoBid, 
  currentAuctionPlayerId, 
  isCurrentUser 
}: { 
  auction: ActiveAuction; 
  role: string; 
  autoBids: AutoBidIndicator[]; 
  managerUserId: string; 
  isLast: boolean;
  userAutoBid?: { max_amount: number; is_active: boolean } | null;
  currentAuctionPlayerId?: number;
  isCurrentUser: boolean;
}) {
  const autoBidIndicator = autoBids.find(ab => ab.player_id === auction.player_id);
  const timeInfo = formatTimeRemaining(auction.scheduled_end_time);
  const roleColor = getRoleColor(role);
  const roleTextColor = getRoleTextColor(role);
  
  // Show user's auto-bid only if this is the current user and current auction
  const showUserAutoBid = isCurrentUser && 
                          userAutoBid && 
                          userAutoBid.is_active && 
                          currentAuctionPlayerId === auction.player_id;

  // Classi esplicite per ogni ruolo
  let bgClass = "bg-gray-700";
  let borderClass = "border-gray-700";
  
  switch (role.toUpperCase()) {
    case 'P':
      bgClass = "bg-yellow-600 bg-opacity-20";
      borderClass = "border-yellow-500";
      break;
    case 'D':
      bgClass = "bg-green-600 bg-opacity-20";
      borderClass = "border-green-500";
      break;
    case 'C':
      bgClass = "bg-blue-600 bg-opacity-20";
      borderClass = "border-blue-500";
      break;
    case 'A':
      bgClass = "bg-red-600 bg-opacity-20";
      borderClass = "border-red-500";
      break;
  }

  return (
    <div className={`p-1.5 flex items-center justify-between ${bgClass} border ${borderClass} ${isLast ? 'rounded-b-md' : ''}`}>
      <div className="flex items-center min-w-0">
        <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${roleColor}`} />
        <span className="text-xs truncate">{auction.player_name}</span>
      </div>
      <div className="text-xs flex items-center justify-between">
        <div className="flex items-center gap-1">
          {showUserAutoBid && (
            <span className="text-blue-400 font-semibold">{userAutoBid.max_amount}</span>
          )}
          <span className={`text-green-400 font-semibold`}>{auction.current_highest_bid_amount || 0}</span>
        </div>
        <span className={`ml-2 ${timeInfo.color} ${timeInfo.color === 'text-red-500' && timeInfo.text.includes('s') ? 'animate-pulse' : ''}`}>
          {timeInfo.text}
        </span>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="p-1.5 flex items-center justify-between bg-gray-600 bg-opacity-20 border border-gray-500 border-dashed rounded-md">
      <div className="flex items-center min-w-0">
        <div className="w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 bg-gray-500 opacity-50" />
        <span className="text-xs truncate">Slot vuoto</span>
      </div>
      <span className="text-xs font-semibold text-gray-500">-</span>
    </div>
  );
}

// Main Component
export function ManagerColumn({
  manager,
  isCurrentUser,
  isHighestBidder,
  position,
  leagueSlots,
  activeAuctions = [],
  autoBids = [],
  userAutoBid,
  currentAuctionPlayerId,
  responseTimers = [],
}: ManagerColumnProps) {
  const [showBiddingInterface, setShowBiddingInterface] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const handleCounterBid = (playerId: number) => {
    setSelectedPlayerId(playerId);
    setShowBiddingInterface(true);
  };
  const getTeamColor = (position: number) => {
    const colors = ['text-red-400', 'text-blue-400', 'text-green-400', 'text-yellow-400', 'text-purple-400', 'text-pink-400', 'text-orange-400', 'text-cyan-400'];
    return colors[(position - 1) % colors.length];
  };

  // Determina il ruolo predominante per il colore della barra di progresso
  const getPredominantRoleColor = () => {
    // Conta i giocatori per ruolo
    const pCount = getRoleCount('P');
    const dCount = getRoleCount('D');
    const cCount = getRoleCount('C');
    const aCount = getRoleCount('A');
    
    // Trova il ruolo con più giocatori
    if (pCount >= dCount && pCount >= cCount && pCount >= aCount) {
      return 'bg-yellow-500';
    } else if (dCount >= pCount && dCount >= cCount && dCount >= aCount) {
      return 'bg-green-500';
    } else if (cCount >= pCount && cCount >= dCount && cCount >= aCount) {
      return 'bg-blue-500';
    } else if (aCount >= pCount && aCount >= dCount && aCount >= cCount) {
      return 'bg-red-500';
    }
    
    // Default
    return 'bg-yellow-500';
  };

  const getRoleCount = (role: string) => {
    const assignedCount = manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase()).length;
    const activeAuctionCount = activeAuctions.filter(a => a.player_role.toUpperCase() === role.toUpperCase() && a.current_highest_bidder_id === manager.user_id).length;
    return assignedCount + activeAuctionCount;
  };

  const createSlotsForRole = (role: string): Slot[] => {
    if (!leagueSlots) return [];
    
    const roleKey = `slots_${role}` as keyof LeagueSlots;
    const totalSlots = leagueSlots[roleKey];
    
    const assignedPlayers = manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase());
    const activeAuctionsForRole = activeAuctions.filter(a => a.player_role.toUpperCase() === role.toUpperCase() && a.current_highest_bidder_id === manager.user_id);
    const responseTimersForRole = responseTimers.filter(t => {
      // Trova il ruolo del giocatore dal timer
      const auction = activeAuctions.find(a => a.player_id === t.player_id);
      return auction?.player_role.toUpperCase() === role.toUpperCase();
    });
    
    const slots: Slot[] = [];
    
    assignedPlayers.forEach(player => slots.push({ type: 'assigned', player }));
    
    // Add response timers (priority over regular auctions for current user)
    if (isCurrentUser) {
      responseTimersForRole.forEach(timer => {
        slots.push({ type: 'response_needed', timer });
      });
    }
    
    // Add auctions for this role (excluding those with response timers for current user)
    activeAuctionsForRole.forEach(auction => {
      const hasResponseTimer = isCurrentUser && responseTimersForRole.some(t => t.player_id === auction.player_id);
      if (!hasResponseTimer) {
        slots.push({ type: 'in_auction', auction });
      }
    });
    
    while (slots.length < totalSlots) {
      slots.push({ type: 'empty' });
    }
    
    return slots;
  };

  const spentBudget = manager.total_budget - manager.current_budget + manager.locked_credits;
  const budgetPercentage = (spentBudget / manager.total_budget) * 100;
  const availableBudget = manager.current_budget - manager.locked_credits;

  return (
    <div className="bg-gray-800 rounded-lg p-2 flex flex-col h-full border-2 border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {isCurrentUser ? <Star className="h-4 w-4 text-yellow-400" /> : <User className="h-4 w-4 text-gray-400" />}
          <span className={`text-xs font-semibold truncate ${getTeamColor(position)}`}>
            {manager.manager_team_name || `Team #${position}`}
          </span>
        </div>
        <div className={`text-lg font-bold ${isHighestBidder ? 'text-green-400' : isCurrentUser ? 'text-yellow-400' : 'text-white'}`}>
          {manager.current_budget}
        </div>
      </div>

      {/* Budget info */}
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>max <span className="text-white">${availableBudget}</span></span>
        <span className="text-white">% {budgetPercentage.toFixed(1)}</span>
      </div>

      {/* Role counters */}
      <div className="flex justify-around text-xs mb-2">
        {['P', 'D', 'C', 'A'].map(role => {
          const currentCount = getRoleCount(role);
          const requiredSlots = leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0;
          const isCompliant = currentCount >= Math.max(0, requiredSlots - 1);
          return (
            <span key={role} className={isCompliant ? 'text-green-400' : 'text-red-400'}>
              {role}: {currentCount}
            </span>
          );
        })}
      </div>

      {/* Budget bar */}
      <div className="w-full bg-gray-600 h-2 rounded-full mb-2">
        <div className={`${getPredominantRoleColor()} h-2 rounded-full transition-all duration-300`} style={{ width: `${Math.min(budgetPercentage, 100)}%` }} />
      </div>

      {/* Slots list */}
      <div className="flex-1 flex flex-col space-y-1 overflow-y-auto scrollbar-hide">
        {['P', 'D', 'C', 'A'].map(role => {
          const slots = createSlotsForRole(role);
          if (slots.length === 0) return null;

          return (
            <div key={role} className="flex flex-col">
              <div className={`${getRoleColor(role)} text-gray-900 px-2 py-1 ${slots.some(s => s.type === 'in_auction') ? 'rounded-t-md' : 'rounded-md mb-1'} text-xs font-semibold flex items-center justify-between`}>
                <span>{role}</span>
                <span>{manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase()).length}/{leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0}</span>
              </div>
              
              <div className="space-y-0.5">
                {slots.map((slot, index) => {
                  switch (slot.type) {
                    case 'assigned':
                      return <AssignedSlot key={index} player={slot.player} role={role} />;
                    case 'in_auction':
                      return <InAuctionSlot 
                        key={index} 
                        auction={slot.auction} 
                        role={role} 
                        autoBids={autoBids} 
                        managerUserId={manager.user_id} 
                        isLast={index === slots.length - 1}
                        userAutoBid={userAutoBid}
                        currentAuctionPlayerId={currentAuctionPlayerId}
                        isCurrentUser={isCurrentUser}
                      />;
                    case 'response_needed':
                      return <ResponseNeededSlot
                        key={index}
                        timer={slot.timer}
                        role={role}
                        leagueId={parseInt(window.location.pathname.split('/')[2])} // Extract from URL
                        isLast={index === slots.length - 1}
                        onCounterBid={handleCounterBid}
                      />;
                    case 'empty':
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
          <div className="text-center text-gray-500 text-xs py-4">
            Configurazione slot non disponibile
          </div>
        )}
      </div>
    </div>
  );
}
