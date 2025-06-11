// src/lib/db/services/bid.service.ts
import { db } from "@/lib/db";

// --- TIPI E INTERFACCE CONDIVISE ---
// (Considera di spostarli in un file dedicato es. src/types/auctions.ts o src/types/index.ts)
export type AppRole = "admin" | "manager"; // Assicurati che sia consistente con globals.d.ts

export interface LeagueForBidding {
  id: number;
  status: string; // es. 'draft_active', 'setup', 'repair_active'
  active_auction_roles: string | null; // es. "P,D,C", "A", "ALL"
  min_bid: number;
  timer_duration_hours: number;
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

export interface PlayerForBidding {
  id: number;
  role: string; // 'P', 'D', 'C', 'A'
}

export interface ParticipantForBidding {
  user_id: string;
  current_budget: number;
  locked_credits: number;
  players_P_acquired: number;
  players_D_acquired: number;
  players_C_acquired: number;
  players_A_acquired: number;
}

export interface BidRecord {
  id: number;
  auction_id: number;
  user_id: string;
  amount: number;
  bid_time: number; // Timestamp Unix
  bid_type: "manual" | "auto" | "quick";
  bidder_username?: string;
}

export interface AuctionStatusDetails {
  id: number; // auction_id
  league_id: number; // Corrisponde a auction_league_id nella tabella auctions
  player_id: number;
  start_time: number;
  scheduled_end_time: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string | null;
  status: string; // 'active', 'closing', 'sold', 'not_sold', 'cancelled'
  created_at: number;
  updated_at: number;
  player_name?: string;
  current_highest_bidder_username?: string;
  bid_history?: BidRecord[];
  time_remaining_seconds?: number;
}

export interface AuctionCreationResult {
  auction_id: number;
  player_id: number;
  league_id: number;
  current_bid: number;
  current_winner_id: string;
  scheduled_end_time: number;
  status: string;
  new_bid_id: number;
}

export interface ExistingAuctionBidResult {
  auction_id: number;
  player_id: number;
  league_id: number;
  new_current_bid: number;
  new_current_winner_id: string;
  new_scheduled_end_time: number;
  new_bid_id: number;
  previous_winner_id: string | null;
  previous_bid_amount: number;
}
// --- FINE TIPI E INTERFACCE ---

export const placeInitialBidAndCreateAuction = async (
  leagueId: number,
  playerId: number,
  bidderUserId: string,
  bidAmount: number
): Promise<AuctionCreationResult> => {
  console.log(
    `[SERVICE BID] placeInitialBidAndCreateAuction: leagueId=${leagueId}, playerId=${playerId}, bidder=${bidderUserId}, amount=${bidAmount}`
  );

  return db.transaction(() => {
    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_hours, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(leagueId) as LeagueForBidding | undefined;

    if (!league) throw new Error(`League with ID ${leagueId} not found.`);
    if (league.status !== "draft_active" && league.status !== "repair_active") {
      throw new Error(
        `Bidding is not currently active for league ${leagueId} (status: ${league.status}).`
      );
    }
    if (bidAmount < league.min_bid) {
      throw new Error(
        `Bid amount ${bidAmount} is less than the minimum bid of ${league.min_bid} for this league.`
      );
    }

    const playerStmt = db.prepare("SELECT id, role FROM players WHERE id = ?");
    const player = playerStmt.get(playerId) as PlayerForBidding | undefined;
    if (!player) throw new Error(`Player with ID ${playerId} not found.`);

    if (league.active_auction_roles && league.active_auction_roles !== "ALL") {
      const activeRoles = league.active_auction_roles.split(",");
      if (!activeRoles.includes(player.role)) {
        throw new Error(
          `Player's role (${player.role}) is not currently active for bidding (active roles: ${league.active_auction_roles}).`
        );
      }
    }

    const assignmentStmt = db.prepare(
      "SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?"
    );
    if (assignmentStmt.get(leagueId, playerId)) {
      // Usa leagueId qui per coerenza con la tabella
      throw new Error(
        `Player ${playerId} has already been assigned in league ${leagueId}.`
      );
    }

    const existingAuctionStmt = db.prepare(
      "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')"
    );
    if (existingAuctionStmt.get(leagueId, playerId)) {
      // Usa leagueId qui
      throw new Error(
        `An active auction already exists for player ${playerId} in league ${leagueId}.`
      );
    }

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participant = participantStmt.get(leagueId, bidderUserId) as
      | ParticipantForBidding
      | undefined;
    if (!participant)
      throw new Error(
        `User ${bidderUserId} is not a participant in league ${leagueId}.`
      );

    // TODO: Implementare logica locked_credits: if ((participant.current_budget - participant.locked_credits) < bidAmount)
    if (participant.current_budget < bidAmount) {
      throw new Error(
        `Insufficient budget for user ${bidderUserId}. Budget: ${participant.current_budget}, Bid: ${bidAmount}.`
      );
    }

    let hasSlot = false;
    switch (player.role) {
      case "P":
        if (participant.players_P_acquired < league.slots_P) hasSlot = true;
        break;
      case "D":
        if (participant.players_D_acquired < league.slots_D) hasSlot = true;
        break;
      case "C":
        if (participant.players_C_acquired < league.slots_C) hasSlot = true;
        break;
      case "A":
        if (participant.players_A_acquired < league.slots_A) hasSlot = true;
        break;
    }
    if (!hasSlot) {
      const acquiredKey =
        `players_${player.role}_acquired` as keyof ParticipantForBidding;
      const maxSlotKey = `slots_${player.role}` as keyof LeagueForBidding;
      throw new Error(
        `User ${bidderUserId} has no available slots for role ${player.role}. Acquired: ${participant[acquiredKey]}, Max: ${league[maxSlotKey]}`
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const auctionDurationSeconds = league.timer_duration_hours * 60 * 60;
    const scheduledEndTime = now + auctionDurationSeconds;

    const createAuctionStmt = db.prepare(
      `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at) 
       VALUES (@league_id, @player_id, @start_time, @scheduled_end_time, @bidAmount, @bidderUserId, 'active', @now, @now)`
    );
    const auctionInfo = createAuctionStmt.run({
      league_id: leagueId, // Nome colonna corretto
      player_id: playerId,
      start_time: now,
      scheduled_end_time: scheduledEndTime,
      bidAmount: bidAmount, // Parametro corretto
      bidderUserId: bidderUserId, // Parametro corretto
      now: now,
    });
    const newAuctionId = auctionInfo.lastInsertRowid as number;
    if (!newAuctionId) throw new Error("Failed to create auction.");
    console.log(`[SERVICE BID] Auction created ID: ${newAuctionId}`);

    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (@auction_id, @user_id, @amount, @bid_time, 'manual')`
    );
    const bidInfo = createBidStmt.run({
      auction_id: newAuctionId,
      user_id: bidderUserId,
      amount: bidAmount,
      bid_time: now,
    });
    const newBidId = bidInfo.lastInsertRowid as number;
    if (!newBidId) throw new Error("Failed to record bid.");
    console.log(`[SERVICE BID] Bid recorded ID: ${newBidId}`);

    // TODO: Aggiornare locked_credits del partecipante.
    // TODO: Aggiornare participant.players_X_acquired (ma solo quando l'asta è VINTA).

    return {
      auction_id: newAuctionId,
      player_id: playerId,
      league_id: leagueId,
      current_bid: bidAmount,
      current_winner_id: bidderUserId,
      scheduled_end_time: scheduledEndTime,
      status: "active",
      new_bid_id: newBidId,
    };
  })();
};

export const placeBidOnExistingAuction = async (
  auctionId: number,
  bidderUserId: string,
  bidAmountFromRequest: number,
  bidType: "manual" | "quick"
): Promise<ExistingAuctionBidResult> => {
  console.log(
    `[SERVICE BID] placeBidOnExistingAuction: auctionId=${auctionId}, bidder=${bidderUserId}, amountReq=${bidAmountFromRequest}, type=${bidType}`
  );
  return db.transaction(() => {
    const auctionStmt = db.prepare(
      // Seleziona auction_league_id per coerenza, anche se AuctionStatusDetails potrebbe aspettarsi league_id
      "SELECT id, auction_league_id, player_id, current_highest_bid_amount, current_highest_bidder_id, status FROM auctions WHERE id = ?"
    );
    const auction = auctionStmt.get(auctionId) as
      | {
          id: number;
          auction_league_id: number; // Nome colonna DB
          player_id: number;
          current_highest_bid_amount: number;
          current_highest_bidder_id: string | null;
          status: string;
        }
      | undefined;

    if (!auction) throw new Error(`Auction with ID ${auctionId} not found.`);
    if (auction.status !== "active" && auction.status !== "closing") {
      throw new Error(
        `Auction ${auctionId} is not active or closing (status: ${auction.status}).`
      );
    }

    let finalBidAmount = bidAmountFromRequest;
    if (bidType === "quick") {
      finalBidAmount = auction.current_highest_bid_amount + 1;
      console.log(
        `[SERVICE BID] Quick bid: calculated amount ${finalBidAmount}`
      );
    }

    if (finalBidAmount <= auction.current_highest_bid_amount) {
      throw new Error(
        `Bid ${finalBidAmount} must be > current bid ${auction.current_highest_bid_amount}.`
      );
    }
    if (auction.current_highest_bidder_id === bidderUserId) {
      throw new Error(`User ${bidderUserId} is already the highest bidder.`);
    }

    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_hours, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(auction.auction_league_id) as
      | LeagueForBidding
      | undefined; // Usa auction_league_id
    if (!league)
      throw new Error(
        `League ${auction.auction_league_id} for auction ${auctionId} not found.`
      );
    if (league.status !== "draft_active" && league.status !== "repair_active") {
      throw new Error(
        `Bidding not active for league ${auction.auction_league_id} (status: ${league.status}).`
      );
    }

    const playerStmt = db.prepare("SELECT id, role FROM players WHERE id = ?");
    const player = playerStmt.get(auction.player_id) as
      | PlayerForBidding
      | undefined;
    if (!player)
      throw new Error(
        `Player ${auction.player_id} for auction ${auctionId} not found.`
      );

    if (league.active_auction_roles && league.active_auction_roles !== "ALL") {
      const activeRoles = league.active_auction_roles.split(",");
      if (!activeRoles.includes(player.role)) {
        throw new Error(
          `Player's role (${player.role}) not active for bidding (active: ${league.active_auction_roles}).`
        );
      }
    }

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participant = participantStmt.get(
      auction.auction_league_id,
      bidderUserId
    ) as ParticipantForBidding | undefined; // Usa auction_league_id
    if (!participant)
      throw new Error(
        `User ${bidderUserId} not in league ${auction.auction_league_id}.`
      );
    if (participant.current_budget < finalBidAmount) {
      throw new Error(
        `Insufficient budget for ${bidderUserId}. Budget: ${participant.current_budget}, Bid: ${finalBidAmount}.`
      );
    }

    let hasSlot = false;
    switch (player.role) {
      case "P":
        if (participant.players_P_acquired < league.slots_P) hasSlot = true;
        break;
      case "D":
        if (participant.players_D_acquired < league.slots_D) hasSlot = true;
        break;
      case "C":
        if (participant.players_C_acquired < league.slots_C) hasSlot = true;
        break;
      case "A":
        if (participant.players_A_acquired < league.slots_A) hasSlot = true;
        break;
    }
    if (!hasSlot) {
      const acquiredKey =
        `players_${player.role}_acquired` as keyof ParticipantForBidding;
      const maxSlotKey = `slots_${player.role}` as keyof LeagueForBidding;
      throw new Error(
        `No available slots for role ${player.role}. Acquired: ${participant[acquiredKey]}, Max: ${league[maxSlotKey]}`
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const auctionDurationSeconds = league.timer_duration_hours * 60 * 60;
    const newScheduledEndTime = now + auctionDurationSeconds;
    const previousWinnerId = auction.current_highest_bidder_id;
    const previousBidAmount = auction.current_highest_bid_amount;

    const updateAuctionStmt = db.prepare(
      `UPDATE auctions SET current_highest_bid_amount = @bid, current_highest_bidder_id = @bidder, 
       scheduled_end_time = @endTime, updated_at = @now WHERE id = @id`
    );
    const updateResult = updateAuctionStmt.run({
      bid: finalBidAmount,
      bidder: bidderUserId,
      endTime: newScheduledEndTime,
      now,
      id: auctionId,
    });
    if (updateResult.changes === 0)
      throw new Error(
        "Failed to update auction, auction may not exist or no changes made."
      );
    console.log(
      `[SERVICE BID] Auction ${auctionId} updated. New winner: ${bidderUserId}, Bid: ${finalBidAmount}`
    );

    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) 
       VALUES (@auction_id, @user_id, @amount, @bid_time, @bid_type)`
    );
    const bidInfo = createBidStmt.run({
      auction_id: auctionId,
      user_id: bidderUserId,
      amount: finalBidAmount,
      bid_time: now,
      bid_type: bidType,
    });
    const newBidId = bidInfo.lastInsertRowid as number;
    if (!newBidId) throw new Error("Failed to record new bid.");
    console.log(
      `[SERVICE BID] New bid ID: ${newBidId} for auction ID: ${auctionId}`
    );

    // TODO: Aggiornare locked_credits per il nuovo e il precedente offerente.

    return {
      auction_id: auctionId,
      player_id: auction.player_id,
      league_id: auction.auction_league_id, // Restituisci auction_league_id
      new_current_bid: finalBidAmount,
      new_current_winner_id: bidderUserId,
      new_scheduled_end_time: newScheduledEndTime,
      new_bid_id: newBidId,
      previous_winner_id: previousWinnerId,
      previous_bid_amount: previousBidAmount,
    };
  })();
};

export const getAuctionStatusForPlayer = async (
  leagueId: number,
  playerId: number
): Promise<AuctionStatusDetails | null> => {
  console.log(
    `[SERVICE BID] getAuctionStatusForPlayer: leagueId=${leagueId}, playerId=${playerId}`
  );
  try {
    // Query corretta con alias e nomi di colonna DB effettivi
    const auctionStmtCorrected = db.prepare(
      `SELECT 
         a.id, a.auction_league_id AS league_id, a.player_id, a.start_time, a.scheduled_end_time, 
         a.current_highest_bid_amount, a.current_highest_bidder_id, a.status, 
         a.created_at, a.updated_at,
         p.name AS player_name,
         u.username AS current_highest_bidder_username
       FROM auctions a
       JOIN players p ON a.player_id = p.id
       LEFT JOIN users u ON a.current_highest_bidder_id = u.id
       WHERE a.auction_league_id = ? AND a.player_id = ?  -- Usa auction_league_id qui
       ORDER BY CASE a.status WHEN 'active' THEN 1 WHEN 'closing' THEN 2 ELSE 3 END, a.updated_at DESC
       LIMIT 1`
    );

    // Cast al tipo che include le proprietà aggiunte dal JOIN
    const auctionDataFromDb = auctionStmtCorrected.get(leagueId, playerId) as
      | (AuctionStatusDetails & {
          player_name: string;
          current_highest_bidder_username: string | null;
        })
      | undefined;

    if (!auctionDataFromDb) {
      console.log(
        `[SERVICE BID] No auction found for player ${playerId} in league ${leagueId}.`
      );
      return null;
    }

    const bidsStmt = db.prepare(
      `SELECT b.id, b.auction_id, b.user_id, b.amount, b.bid_time, b.bid_type, u.username as bidder_username
       FROM bids b
       JOIN users u ON b.user_id = u.id
       WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 10`
    );
    const bidHistory = bidsStmt.all(auctionDataFromDb.id) as BidRecord[];

    let timeRemainingSeconds: number | undefined = undefined;
    if (
      auctionDataFromDb.status === "active" ||
      auctionDataFromDb.status === "closing"
    ) {
      const now = Math.floor(Date.now() / 1000);
      timeRemainingSeconds = Math.max(
        0,
        auctionDataFromDb.scheduled_end_time - now
      );
    }

    // Costruisci l'oggetto risultato mappando i campi se necessario
    // auctionDataFromDb.league_id è già aliasato da a.auction_league_id AS league_id
    const result: AuctionStatusDetails = {
      id: auctionDataFromDb.id,
      league_id: auctionDataFromDb.league_id, // Questo ora è corretto grazie all'alias
      player_id: auctionDataFromDb.player_id,
      start_time: auctionDataFromDb.start_time,
      scheduled_end_time: auctionDataFromDb.scheduled_end_time,
      current_highest_bid_amount: auctionDataFromDb.current_highest_bid_amount,
      current_highest_bidder_id: auctionDataFromDb.current_highest_bidder_id,
      status: auctionDataFromDb.status,
      created_at: auctionDataFromDb.created_at,
      updated_at: auctionDataFromDb.updated_at,
      player_name: auctionDataFromDb.player_name,
      current_highest_bidder_username:
        auctionDataFromDb.current_highest_bidder_username,
      bid_history: bidHistory.reverse(),
      time_remaining_seconds: timeRemainingSeconds,
    };

    console.log(
      `[SERVICE BID] Auction status found for player ${playerId} in league ${leagueId}.`
    );
    return result;
  } catch (error) {
    console.error("[SERVICE BID] Error in getAuctionStatusForPlayer:", error);
    throw new Error("Failed to retrieve auction status.");
  }
};
