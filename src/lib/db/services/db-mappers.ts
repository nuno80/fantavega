// src/lib/db/services/db-mappers.ts
// Validazione runtime per le righe del DB nei flussi finanziari di bid.
// Sostituisce i cast `as unknown as` con controlli che lanciano errori
// con il nome del campo quando il tipo non corrisponde.
import type {
  LeagueForBidding,
  ParticipantForBidding,
  PlayerForBidding,
} from "./bid-validation";

export type RowValue = null | string | number | bigint | ArrayBuffer;
export type RowShape = Record<string, RowValue>;

export const requiredNumber = (row: RowShape, field: string): number => {
  const v = row[field];
  if (typeof v !== "number" && typeof v !== "bigint") {
    throw new Error(`Campo DB "${field}" non è un numero (valore: ${String(v)})`);
  }
  return Number(v);
};

export const requiredString = (row: RowShape, field: string): string => {
  const v = row[field];
  if (typeof v !== "string") {
    throw new Error(`Campo DB "${field}" non è una stringa (valore: ${String(v)})`);
  }
  return v;
};

export const optionalString = (row: RowShape, field: string): string | null => {
  const v = row[field];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") {
    throw new Error(`Campo DB "${field}" non è una stringa (valore: ${String(v)})`);
  }
  return v;
};

export const optionalNumber = (row: RowShape, field: string): number | undefined => {
  const v = row[field];
  if (v === null || v === undefined) return undefined;
  if (typeof v !== "number" && typeof v !== "bigint") {
    throw new Error(`Campo DB "${field}" non è un numero (valore: ${String(v)})`);
  }
  return Number(v);
};

// Mapper: riga singola da un ResultSet (convenzione rows[0]).
export const mapRow = (row: RowShape | undefined): RowShape | undefined => {
  if (!row) return undefined;
  return row;
};

// Mapper: participant (league_participants) nei flussi di offerta.
export const mapParticipant = (row: RowShape | undefined): ParticipantForBidding | undefined => {
  if (!row) return undefined;
  return {
    user_id: requiredString(row, "user_id"),
    current_budget: requiredNumber(row, "current_budget"),
    locked_credits: requiredNumber(row, "locked_credits"),
    players_P_acquired: optionalNumber(row, "players_P_acquired"),
    players_D_acquired: optionalNumber(row, "players_D_acquired"),
    players_C_acquired: optionalNumber(row, "players_C_acquired"),
    players_A_acquired: optionalNumber(row, "players_A_acquired"),
  };
};

// Mapper: asta combinata (auctions + players) usata in placeBidOnExistingAuction.
export const mapCombinedAuction = (
  row: RowShape | undefined
): CombinedAuctionForBid | undefined => {
  if (!row) return undefined;
  return {
    auction_id: requiredNumber(row, "auction_id"),
    current_highest_bid_amount: requiredNumber(row, "current_highest_bid_amount"),
    current_highest_bidder_id: optionalString(row, "current_highest_bidder_id"),
    scheduled_end_time: requiredNumber(row, "scheduled_end_time"),
    user_auction_states: optionalString(row, "user_auction_states"),
    league_id: requiredNumber(row, "league_id"),
    league_status: requiredString(row, "league_status"),
    active_auction_roles: optionalString(row, "active_auction_roles"),
    min_bid: requiredNumber(row, "min_bid"),
    timer_duration_minutes: requiredNumber(row, "timer_duration_minutes"),
    slots_P: requiredNumber(row, "slots_P"),
    slots_D: requiredNumber(row, "slots_D"),
    slots_C: requiredNumber(row, "slots_C"),
    slots_A: requiredNumber(row, "slots_A"),
    player_id: requiredNumber(row, "player_id"),
    player_role: requiredString(row, "player_role"),
  };
};

// Mapper: league (auction_leagues) per il flusso di prima offerta.
export const mapLeagueForBidding = (
  row: RowShape | undefined
): (LeagueForBidding & { config_json: string }) | undefined => {
  if (!row) return undefined;
  return {
    id: requiredNumber(row, "id"),
    status: requiredString(row, "status"),
    active_auction_roles: optionalString(row, "active_auction_roles"),
    min_bid: requiredNumber(row, "min_bid"),
    timer_duration_minutes: requiredNumber(row, "timer_duration_minutes"),
    slots_P: requiredNumber(row, "slots_P"),
    slots_D: requiredNumber(row, "slots_D"),
    slots_C: requiredNumber(row, "slots_C"),
    slots_A: requiredNumber(row, "slots_A"),
    config_json: requiredString(row, "config_json"),
  };
};

// Mapper: player (players) per il flusso di prima offerta.
export const mapPlayerForBidding = (
  row: RowShape | undefined
): (PlayerForBidding & { current_quotation: number }) | undefined => {
  if (!row) return undefined;
  return {
    id: requiredNumber(row, "id"),
    role: requiredString(row, "role"),
    name: optionalString(row, "name") ?? undefined,
    current_quotation: requiredNumber(row, "current_quotation"),
  };
};

// Mapper: asta esistente (auctions) per il controllo di duplicazione.
export const mapExistingAuction = (
  row: RowShape | undefined
): { id: number; scheduled_end_time: number; status: string } | undefined => {
  if (!row) return undefined;
  return {
    id: requiredNumber(row, "id"),
    scheduled_end_time: requiredNumber(row, "scheduled_end_time"),
    status: requiredString(row, "status"),
  };
};

// Mapper: info giocatore per il payload Socket.IO di auction-created.
export const mapPlayerInfo = (
  row: RowShape | undefined
): { name: string; role: string; team: string } | undefined => {
  if (!row) return undefined;
  return {
    name: requiredString(row, "name"),
    role: requiredString(row, "role"),
    team: requiredString(row, "team"),
  };
};

// Tipi esportati (coerenti con i mapper sopra)
export interface CombinedAuctionForBid {
  auction_id: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string | null;
  scheduled_end_time: number;
  user_auction_states: string | null;
  league_id: number;
  league_status: string;
  active_auction_roles: string | null;
  min_bid: number;
  timer_duration_minutes: number;
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
  player_id: number;
  player_role: string;
}
