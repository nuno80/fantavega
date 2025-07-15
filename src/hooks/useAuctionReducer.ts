// src/hooks/useAuctionReducer.ts
// Hook personalizzato per gestire lo stato complesso delle aste con useReducer

import { useReducer, useMemo } from "react";
import type { BidRecord } from "@/lib/db/services/bid.service";

// Tipi per lo stato dell'asta
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

export interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
}

export interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

export interface ActiveAuction {
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

export interface AutoBidIndicator {
  player_id: number;
  auto_bid_count: number;
}

// Stato completo dell'applicazione
export interface AuctionState {
  currentAuction: ActiveAuction | null;
  userBudget: UserBudgetInfo | null;
  leagueInfo: LeagueInfo | null;
  managers: Manager[];
  leagueSlots: LeagueSlots | null;
  activeAuctions: ActiveAuction[];
  autoBids: AutoBidIndicator[];
  bidHistory: BidRecord[];
  leagues: LeagueInfo[];
  showLeagueSelector: boolean;
  isLoading: boolean;
  selectedLeagueId: number | null;
  userAutoBid: { max_amount: number; is_active: boolean } | null;
  userAuctionStates: UserAuctionState[];
}

// Azioni per il reducer
export type AuctionAction =
  | { type: 'SET_CURRENT_AUCTION'; payload: ActiveAuction | null }
  | { type: 'UPDATE_AUCTION_BID'; payload: { playerId: number; newPrice: number; highestBidderId: string; scheduledEndTime: number } }
  | { type: 'CLOSE_AUCTION'; payload: { playerId: number } }
  | { type: 'SET_USER_BUDGET'; payload: UserBudgetInfo | null }
  | { type: 'SET_LEAGUE_INFO'; payload: LeagueInfo | null }
  | { type: 'SET_MANAGERS'; payload: Manager[] }
  | { type: 'SET_LEAGUE_SLOTS'; payload: LeagueSlots | null }
  | { type: 'SET_ACTIVE_AUCTIONS'; payload: ActiveAuction[] }
  | { type: 'SET_AUTO_BIDS'; payload: AutoBidIndicator[] }
  | { type: 'SET_BID_HISTORY'; payload: BidRecord[] }
  | { type: 'SET_LEAGUES'; payload: LeagueInfo[] }
  | { type: 'TOGGLE_LEAGUE_SELECTOR'; payload?: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_LEAGUE'; payload: number | null }
  | { type: 'SET_USER_AUTO_BID'; payload: { max_amount: number; is_active: boolean } | null }
  | { type: 'SET_USER_AUCTION_STATES'; payload: UserAuctionState[] }
  | { type: 'RESET_STATE'; payload: AuctionState };

// Reducer function
export function auctionReducer(state: AuctionState, action: AuctionAction): AuctionState {
  switch (action.type) {
    case 'SET_CURRENT_AUCTION':
      return { ...state, currentAuction: action.payload };
    
    case 'UPDATE_AUCTION_BID':
      if (state.currentAuction && action.payload.playerId === state.currentAuction.player_id) {
        return {
          ...state,
          currentAuction: {
            ...state.currentAuction,
            current_highest_bid_amount: action.payload.newPrice,
            current_highest_bidder_id: action.payload.highestBidderId,
            scheduled_end_time: action.payload.scheduledEndTime,
          }
        };
      }
      return state;
    
    case 'CLOSE_AUCTION':
      if (state.currentAuction && action.payload.playerId === state.currentAuction.player_id) {
        return {
          ...state,
          currentAuction: {
            ...state.currentAuction,
            status: "sold"
          }
        };
      }
      return state;
    
    case 'SET_USER_BUDGET':
      return { ...state, userBudget: action.payload };
    
    case 'SET_LEAGUE_INFO':
      return { ...state, leagueInfo: action.payload };
    
    case 'SET_MANAGERS':
      return { ...state, managers: action.payload };
    
    case 'SET_LEAGUE_SLOTS':
      return { ...state, leagueSlots: action.payload };
    
    case 'SET_ACTIVE_AUCTIONS':
      return { ...state, activeAuctions: action.payload };
    
    case 'SET_AUTO_BIDS':
      return { ...state, autoBids: action.payload };
    
    case 'SET_BID_HISTORY':
      return { ...state, bidHistory: action.payload };
    
    case 'SET_LEAGUES':
      return { ...state, leagues: action.payload };
    
    case 'TOGGLE_LEAGUE_SELECTOR':
      return { 
        ...state, 
        showLeagueSelector: action.payload !== undefined ? action.payload : !state.showLeagueSelector 
      };
    
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_SELECTED_LEAGUE':
      return { ...state, selectedLeagueId: action.payload };
    
    case 'SET_USER_AUTO_BID':
      return { ...state, userAutoBid: action.payload };
    
    case 'SET_USER_AUCTION_STATES':
      return { ...state, userAuctionStates: action.payload };
    
    case 'RESET_STATE':
      return action.payload;
    
    default:
      return state;
  }
}

// Hook personalizzato che combina useReducer con calcoli memoizzati
export function useAuctionReducer(initialData: any) {
  const initialState: AuctionState = {
    currentAuction: initialData.currentAuction,
    userBudget: initialData.userBudget,
    leagueInfo: initialData.leagueInfo,
    managers: initialData.managers,
    leagueSlots: initialData.leagueSlots,
    activeAuctions: initialData.activeAuctions,
    autoBids: initialData.autoBids,
    bidHistory: initialData.bidHistory,
    leagues: initialData.leagues,
    showLeagueSelector: false,
    isLoading: false,
    selectedLeagueId: initialData.leagueInfo?.id || null,
    userAutoBid: initialData.userAutoBid,
    userAuctionStates: initialData.userAuctionStates,
  };

  const [state, dispatch] = useReducer(auctionReducer, initialState);

  // Calcoli memoizzati per ottimizzare le performance
  const memoizedValues = useMemo(() => {
    // Ordina i manager per budget disponibile (decrescente)
    const sortedManagers = [...state.managers].sort(
      (a, b) => (b.current_budget - b.locked_credits) - (a.current_budget - a.locked_credits)
    );

    // Calcola statistiche della lega
    const leagueStats = {
      totalManagers: state.managers.length,
      totalBudget: state.managers.reduce((sum, m) => sum + m.total_budget, 0),
      totalSpent: state.managers.reduce((sum, m) => sum + (m.total_budget - m.current_budget), 0),
      averageBudget: state.managers.length > 0 
        ? state.managers.reduce((sum, m) => sum + m.current_budget, 0) / state.managers.length 
        : 0,
    };

    // Filtra aste attive per il giocatore corrente
    const currentPlayerAuctions = state.activeAuctions.filter(
      auction => state.currentAuction && auction.player_id === state.currentAuction.player_id
    );

    // Calcola auto-bid per il giocatore corrente
    const currentPlayerAutoBids = state.autoBids.filter(
      autoBid => state.currentAuction && autoBid.player_id === state.currentAuction.player_id
    );

    return {
      sortedManagers,
      leagueStats,
      currentPlayerAuctions,
      currentPlayerAutoBids,
    };
  }, [state.managers, state.activeAuctions, state.autoBids, state.currentAuction]);

  return {
    state,
    dispatch,
    ...memoizedValues,
  };
}