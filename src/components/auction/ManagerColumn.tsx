"use client";

// import { Badge } from "@/components/ui/badge";
import { Star, User } from "lucide-react";

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

interface Slot {
  type: 'assigned' | 'in_auction' | 'empty';
  player: PlayerInRoster | null;
  auction: ActiveAuction | null;
}

interface ManagerColumnProps {
  manager: Manager;
  isCurrentUser: boolean;
  isHighestBidder: boolean;
  position: number;
  leagueSlots?: LeagueSlots;
  activeAuctions?: ActiveAuction[];
  autoBids?: AutoBid[];
}

export function ManagerColumn({
  manager,
  isCurrentUser,
  isHighestBidder,
  position,
  leagueSlots,
  activeAuctions = [],
  autoBids = [],
}: ManagerColumnProps) {
  const getRoleColor = (role: string) => {
    switch (role.toUpperCase()) {
      case 'P': return 'bg-yellow-500';
      case 'D': return 'bg-green-500';
      case 'C': return 'bg-blue-500';
      case 'A': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTeamColor = (position: number) => {
    const colors = [
      'text-red-400',    // Team 1
      'text-blue-400',   // Team 2
      'text-green-400',  // Team 3
      'text-yellow-400', // Team 4
      'text-purple-400', // Team 5
      'text-pink-400',   // Team 6
      'text-orange-400', // Team 7
      'text-cyan-400',   // Team 8
    ];
    return colors[(position - 1) % colors.length];
  };

  const getRoleCount = (role: string) => {
    // Count assigned players
    const assignedCount = manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase()).length;
    
    // Count active auctions where this manager is highest bidder
    const activeAuctionCount = activeAuctions.filter(auction => 
      auction.player_role.toUpperCase() === role.toUpperCase() &&
      auction.current_highest_bidder_id === manager.user_id
    ).length;
    
    return assignedCount + activeAuctionCount;
  };

  const getPlayersByRole = (role: string) => {
    return manager.players.filter(p => p.role.toUpperCase() === role.toUpperCase());
  };

  const getActiveAuctionsByRole = (role: string) => {
    return activeAuctions.filter(auction => 
      auction.player_role.toUpperCase() === role.toUpperCase() &&
      auction.current_highest_bidder_id === manager.user_id
    );
  };

  const createSlotsForRole = (role: string) => {
    if (!leagueSlots) return [];
    
    const roleKey = `slots_${role}` as keyof LeagueSlots;
    const totalSlots = leagueSlots[roleKey];
    const assignedPlayers = getPlayersByRole(role);
    const activeAuctionsForRole = getActiveAuctionsByRole(role);
    
    const slots = [];
    
    // Add assigned players
    assignedPlayers.forEach(player => {
      slots.push({
        type: 'assigned' as const,
        player,
        auction: null
      });
    });
    
    // Add active auctions where this manager is highest bidder
    activeAuctionsForRole.forEach(auction => {
      slots.push({
        type: 'in_auction' as const,
        player: null,
        auction
      });
    });
    
    // Fill remaining slots as empty
    const remainingSlots = totalSlots - slots.length;
    for (let i = 0; i < remainingSlots; i++) {
      slots.push({
        type: 'empty' as const,
        player: null,
        auction: null
      });
    }
    
    return slots;
  };

  const formatTimeRemaining = (endTime: number) => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, endTime - now);
    
    if (remaining === 0) return { text: "Scaduto", color: "text-red-500" };
    
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    
    let color = "text-white"; // > 1 ora
    let text = "";
    
    if (remaining < 300) { // < 5 minuti
      color = "text-red-500";
      if (remaining < 60) { // < 1 minuto - mostra secondi
        text = `${seconds}s`;
      } else {
        text = `${minutes}m`;
      }
    } else if (remaining < 3600) { // < 1 ora
      color = "text-orange-400";
      text = `${minutes}m`;
    } else { // > 1 ora
      text = `${hours}h ${minutes}m`;
    }
    
    return { text, color };
  };

  // Calculate budget info including locked credits
  const spentBudget = manager.total_budget - manager.current_budget + manager.locked_credits;
  const budgetPercentage = (spentBudget / manager.total_budget) * 100;
  const availableBudget = manager.current_budget - manager.locked_credits;

  return (
    <div className="bg-gray-800 rounded-lg p-2 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {isCurrentUser ? (
            <Star className="h-4 w-4 text-yellow-400" />
          ) : (
            <User className="h-4 w-4 text-gray-400" />
          )}
          <span className={`text-xs font-semibold truncate ${getTeamColor(position)}`}>
            {manager.manager_team_name || `Team #${position}`}
          </span>
        </div>
        <div className={`text-lg font-bold ${
          isHighestBidder ? 'text-green-400' : 
          isCurrentUser ? 'text-yellow-400' : 'text-white'
        }`}>
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
          const minRequired = Math.max(0, requiredSlots - 1); // Logic from penalty service
          const isCompliant = currentCount >= minRequired;
          
          return (
            <span 
              key={role}
              className={isCompliant ? 'text-green-400' : 'text-red-400'}
            >
              {role}: {currentCount}
            </span>
          );
        })}
      </div>

      {/* Budget bar */}
      <div className="w-full bg-gray-600 h-1 rounded-full mb-2">
        <div 
          className="bg-yellow-500 h-1 rounded-full transition-all duration-300" 
          style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
        />
      </div>

      {/* Slots list */}
      <div className="flex-1 flex flex-col space-y-1 overflow-hidden">
        {['P', 'D', 'C', 'A'].map(role => {
          const slots = createSlotsForRole(role);
          if (slots.length === 0) return null;

          return (
            <div key={role} className="flex flex-col">
              {/* Role header */}
              <div className={`${getRoleColor(role)} text-gray-900 px-2 py-0.5 ${slots.some(s => s.type === 'in_auction') ? 'rounded-t-md' : 'rounded-md mb-1'} text-xs font-semibold flex items-center justify-between`}>
                <span>{role}</span>
                <span>{getPlayersByRole(role).length}/{leagueSlots?.[`slots_${role}` as keyof LeagueSlots] || 0}</span>
              </div>
              
              {/* Slots in this role */}
              <div className="space-y-0.5">
                {slots.map((slot, index) => (
                  <div 
                    key={`${role}-${index}`}
                    className={`p-1.5 flex items-center justify-between ${
                      slot.type === 'assigned' ? 'bg-gray-700 rounded-md' :
                      slot.type === 'in_auction' ? `${getRoleColor(role).replace('-500', '-600')} bg-opacity-20 border ${getRoleColor(role).replace('bg-', 'border-')} ${index === slots.length - 1 ? 'rounded-b-md' : 'rounded-md'}` :
                      'bg-gray-600 bg-opacity-50 border border-gray-500 border-dashed rounded-md'
                    }`}
                  >
                    <div className="flex items-center min-w-0">
                      <div className={`w-4 h-4 rounded-sm mr-1.5 flex-shrink-0 ${
                        slot.type === 'assigned' ? getRoleColor(role).replace('bg-', 'bg-').replace('-500', '-600') :
                        slot.type === 'in_auction' ? getRoleColor(role) :
                        'bg-gray-500 opacity-50'
                      }`} />
                      <span className="text-xs truncate">
                        {slot.type === 'assigned' && slot.player ? slot.player.name :
                         slot.type === 'in_auction' && slot.auction ? slot.auction.player_name :
                         'Slot vuoto'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold flex-shrink-0">
                      {slot.type === 'assigned' && slot.player ? (
                        <span className="text-green-400">{role} {slot.player.assignment_price}</span>
                      ) : slot.type === 'in_auction' && slot.auction ? (
                        <div className="text-xs">
                          {(() => {
                            const autoBid = autoBids.find(ab => 
                              ab.player_id === slot.auction!.player_id && 
                              ab.user_id === manager.user_id
                            );
                            const timeInfo = formatTimeRemaining(slot.auction.scheduled_end_time);
                            
                            return (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  {autoBid && (
                                    <span className="text-blue-400 font-semibold">
                                      {autoBid.max_bid_amount}
                                    </span>
                                  )}
                                  <span className="text-green-400 font-semibold">
                                    {slot.auction.current_highest_bid_amount}
                                  </span>
                                </div>
                                <span 
                                  className={`ml-2 ${timeInfo.color} ${timeInfo.color === 'text-red-500' && timeInfo.text.includes('s') ? 'animate-pulse' : ''}`}
                                >
                                  {timeInfo.text}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </span>
                  </div>
                ))}
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