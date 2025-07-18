import type { BidRecord, AuctionStatusDetails } from "@/lib/db/services/bid.service";

export interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  team_name?: string;
  total_budget: number;
}

export interface LeagueInfo {
  id: number;
  name: string;
  min_bid: number;
  status: string;
}

export interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
}

export interface Manager {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
  firstName?: string;
  lastName?: string;
  players: PlayerInRoster[];
}

export interface UserAuctionState {
  auction_id: number;
  player_id: number;
  player_name: string;
  current_bid: number;
  user_state: 'miglior_offerta' | 'rilancio_possibile' | 'asta_abbandonata';
  response_deadline: number | null;
  time_remaining: number | null;
  is_highest_bidder: boolean;
}

export interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

export interface ActiveAuction extends AuctionStatusDetails {
  player_value?: number;
}

export interface AutoBidIndicator {
  player_id: number;
  auto_bid_count: number;
}

export interface InitialAuctionData {
  leagues: LeagueInfo[];
  leagueInfo: LeagueInfo;
  managers: Manager[];
  leagueSlots: LeagueSlots | null;
  activeAuctions: ActiveAuction[];
  autoBids: AutoBidIndicator[];
  userAuctionStates: UserAuctionState[];
  userBudget: UserBudgetInfo | null;
  currentAuction: AuctionStatusDetails | null;
  bidHistory: BidRecord[];
  userAutoBid: { max_amount: number; is_active: boolean } | null;
}
