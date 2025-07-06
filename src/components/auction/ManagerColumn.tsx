"use client";

import { Star, User } from "lucide-react";

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

interface AutoBid {
  player_id: number;
  user_id: string;
  max_bid_amount: number;
}

// Discriminated union for Slot
type Slot =
  | { type: 'assigned'; player: PlayerInRoster }
  | { type: 'in_auction'; auction: ActiveAuction }
  | { type: 'empty' };

interface ManagerColumnProps {
  manager: Manager;
  isCurrentUser: boolean;
  isHighestBidder: boolean;
  position: number;
  leagueSlots?: LeagueSlots;
  activeAuctions?: ActiveAuction[];
  autoBids?: AutoBid[];
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
  return (
    <div className="p-1.5 flex items-center justify-between bg-gray-700 rounded-md">
      <div className="flex items-center min-w-0">
        <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${getRoleColor(role).replace('-500', '-600')}`} />
        <span className="text-xs truncate">{player.name}</span>
      </div>
      <span className="text-xs font-semibold flex-shrink-0 text-green-400">
        {role} {player.assignment_price}
      </span>
    </div>
  );
}

function InAuctionSlot({ auction, role, autoBids = [], managerUserId, isLast }: { auction: ActiveAuction; role: string; autoBids: AutoBid[]; managerUserId: string; isLast: boolean }) {
  const autoBid = autoBids.find(ab => ab.player_id === auction.player_id && ab.user_id === managerUserId);
  const timeInfo = formatTimeRemaining(auction.scheduled_end_time);
  const roleColor = getRoleColor(role);

  return (
    <div className={`p-1.5 flex items-center justify-between ${roleColor.replace('-500', '-600')} bg-opacity-20 border ${roleColor.replace('bg-', 'border-')} ${isLast ? 'rounded-b-md' : ''}`}>
      <div className="flex items-center min-w-0">
        <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${roleColor}`} />
        <span className="text-xs truncate">{auction.player_name}</span>
      </div>
      <div className="text-xs flex items-center justify-between">
        <div className="flex items-center gap-1">
          {autoBid && <span className="text-blue-400 font-semibold">{autoBid.max_bid_amount}</span>}
          <span className="text-green-400 font-semibold">{auction.current_highest_bid_amount || 0}</span>
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
    <div className="p-1.5 flex items-center justify-between bg-gray-600 bg-opacity-50 border border-gray-500 border-dashed rounded-md">
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
}: ManagerColumnProps) {
  const getTeamColor = (position: number) => {
    const colors = ['text-red-400', 'text-blue-400', 'text-green-400', 'text-yellow-400', 'text-purple-400', 'text-pink-400', 'text-orange-400', 'text-cyan-400'];
    return colors[(position - 1) % colors.length];
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
    
    const slots: Slot[] = [];
    
    assignedPlayers.forEach(player => slots.push({ type: 'assigned', player }));
    activeAuctionsForRole.forEach(auction => slots.push({ type: 'in_auction', auction }));
    
    while (slots.length < totalSlots) {
      slots.push({ type: 'empty' });
    }
    
    return slots;
  };

  const spentBudget = manager.total_budget - manager.current_budget + manager.locked_credits;
  const budgetPercentage = (spentBudget / manager.total_budget) * 100;
  const availableBudget = manager.current_budget - manager.locked_credits;

  return (
    <div className="bg-gray-800 rounded-lg p-2 flex flex-col h-full">
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
      <div className="w-full bg-gray-600 h-1 rounded-full mb-2">
        <div className="bg-yellow-500 h-1 rounded-full transition-all duration-300" style={{ width: `${Math.min(budgetPercentage, 100)}%` }} />
      </div>

      {/* Slots list */}
      <div className="flex-1 flex flex-col space-y-1 overflow-y-auto scrollbar-hide">
        {['P', 'D', 'C', 'A'].map(role => {
          const slots = createSlotsForRole(role);
          if (slots.length === 0) return null;

          return (
            <div key={role} className="flex flex-col">
              <div className={`${getRoleColor(role)} text-gray-900 px-2 py-0.5 ${slots.some(s => s.type === 'in_auction') ? 'rounded-t-md' : 'rounded-md mb-1'} text-xs font-semibold flex items-center justify-between`}>
                <span>{role}</span>
                <span>{manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase()).length}/{leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0}</span>
              </div>
              
              <div className="space-y-0.5">
                {slots.map((slot, index) => {
                  switch (slot.type) {
                    case 'assigned':
                      return <AssignedSlot key={index} player={slot.player} role={role} />;
                    case 'in_auction':
                      return <InAuctionSlot key={index} auction={slot.auction} role={role} autoBids={autoBids} managerUserId={manager.user_id} isLast={index === slots.length - 1} />;
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
