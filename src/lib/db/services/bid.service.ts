// src/lib/db/services/bid.service.ts v.1.2
// Servizio per la logica di business relativa alle offerte e alle aste.
// 1. Importazioni
import { db } from "@/lib/db";

// 2. Tipi e Interfacce Esportate
export type AppRole = "admin" | "manager";

export interface LeagueForBidding {
  id: number;
  status: string;
  active_auction_roles: string | null;
  min_bid: number;
  timer_duration_hours: number;
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

export interface PlayerForBidding {
  id: number;
  role: string;
}

export interface ParticipantForBidding {
  user_id: string;
  current_budget: number;
  locked_credits: number;
}

export interface BidRecord {
  id: number;
  auction_id: number;
  user_id: string;
  amount: number;
  bid_time: number;
  bid_type: "manual" | "auto" | "quick";
  bidder_username?: string;
}

export interface AuctionStatusDetails {
  id: number;
  league_id: number;
  player_id: number;
  start_time: number;
  scheduled_end_time: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string | null;
  status: string;
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

// 3. Funzione Helper Interna per Controllo Slot e Budget
const checkSlotsAndBudgetOrThrow = (
  league: LeagueForBidding,
  player: PlayerForBidding,
  participant: ParticipantForBidding,
  bidderUserIdForCheck: string,
  bidAmountForCheck: number,
  isNewAuctionAttempt: boolean,
  currentAuctionTargetPlayerId?: number
) => {
  if (participant.current_budget < bidAmountForCheck) {
    throw new Error(
      `Insufficient budget for user ${bidderUserIdForCheck}. Budget: ${participant.current_budget}, Bid: ${bidAmountForCheck}.`
    );
  }

  const countAssignedPlayerForRoleStmt = db.prepare(
    `SELECT COUNT(*) as count
       FROM player_assignments pa
       JOIN players p ON pa.player_id = p.id
       WHERE pa.auction_league_id = ? AND pa.user_id = ? AND p.role = ?`
  );
  const assignedCountResult = countAssignedPlayerForRoleStmt.get(
    league.id,
    bidderUserIdForCheck,
    player.role
  ) as { count: number };
  const currentlyAssignedForRole = assignedCountResult.count;

  let activeBidsAsWinnerSql = `SELECT COUNT(DISTINCT a.player_id) as count
       FROM auctions a
       JOIN players p ON a.player_id = p.id
       WHERE a.auction_league_id = ?
         AND a.current_highest_bidder_id = ?
         AND p.role = ?
         AND a.status IN ('active', 'closing')`;

  const activeBidsQueryParams: (string | number)[] = [
    league.id,
    bidderUserIdForCheck,
    player.role,
  ];

  if (!isNewAuctionAttempt && currentAuctionTargetPlayerId !== undefined) {
    activeBidsAsWinnerSql += ` AND a.player_id != ?`;
    activeBidsQueryParams.push(currentAuctionTargetPlayerId);
  }

  const activeBidsAsWinnerStmt = db.prepare(activeBidsAsWinnerSql);
  const activeBidsResult = activeBidsAsWinnerStmt.get(
    ...activeBidsQueryParams
  ) as { count: number };
  const activeWinningBidsForRoleOnOtherPlayers = activeBidsResult.count;

  const slotsVirtuallyOccupiedByOthers =
    currentlyAssignedForRole + activeWinningBidsForRoleOnOtherPlayers;

  let maxSlotsForRole: number;
  switch (player.role) {
    case "P":
      maxSlotsForRole = league.slots_P;
      break;
    case "D":
      maxSlotsForRole = league.slots_D;
      break;
    case "C":
      maxSlotsForRole = league.slots_C;
      break;
    case "A":
      maxSlotsForRole = league.slots_A;
      break;
    default:
      console.error(
        `[SERVICE ERROR SLOTS] Invalid player role for slot check: ${player.role}`
      );
      throw new Error(
        `Invalid player role (${player.role}) for slot checking.`
      );
  }

  console.log(
    `[SERVICE DEBUG SLOTS] User: ${bidderUserIdForCheck}, Role: ${player.role}, TargetPlayerID: ${player.id}`
  );
  console.log(
    `  Assigned: ${currentlyAssignedForRole}, ActiveWinningBidsOnOtherPlayers: ${activeWinningBidsForRoleOnOtherPlayers}`
  );
  console.log(
    `  SlotsVirtualByOthers: ${slotsVirtuallyOccupiedByOthers}, MaxSlotsForRole: ${maxSlotsForRole}`
  );

  const slotErrorMessage =
    "Slot full, you cannot bid for other players of this specific role";

  if (isNewAuctionAttempt) {
    if (slotsVirtuallyOccupiedByOthers + 1 > maxSlotsForRole) {
      // MODIFICA PER prefer-template
      throw new Error(
        `${slotErrorMessage} (Role: ${player.role}, Max: ${maxSlotsForRole}, Current commitments: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  } else {
    if (slotsVirtuallyOccupiedByOthers >= maxSlotsForRole) {
      // MODIFICA PER prefer-template
      throw new Error(
        `${slotErrorMessage} (Role: ${player.role}, Max: ${maxSlotsForRole}, Current commitments: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  }
  console.log(
    `[SERVICE DEBUG SLOTS] Slot check passed for User: ${bidderUserIdForCheck}, Role: ${player.role}`
  );
};

// 4. Funzioni Esportate del Servizio
export const placeInitialBidAndCreateAuction = async (
  // ... implementazioni rimanenti invariate ...
  leagueIdParam: number,
  playerIdParam: number,
  bidderUserIdParam: string,
  bidAmountParam: number
): Promise<AuctionCreationResult> => {
  console.log(
    `[SERVICE BID] placeInitialBidAndCreateAuction: leagueId=${leagueIdParam}, playerId=${playerIdParam}, bidder=${bidderUserIdParam}, amount=${bidAmountParam}`
  );

  return db.transaction(() => {
    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_hours, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(leagueIdParam) as
      | LeagueForBidding
      | undefined;
    if (!league) throw new Error(`League with ID ${leagueIdParam} not found.`);
    if (league.status !== "draft_active" && league.status !== "repair_active")
      throw new Error(
        `Bidding is not currently active for league ${leagueIdParam} (status: ${league.status}).`
      );
    if (bidAmountParam < league.min_bid)
      throw new Error(
        `Bid amount ${bidAmountParam} is less than the minimum bid of ${league.min_bid} for this league.`
      );

    const playerStmt = db.prepare("SELECT id, role FROM players WHERE id = ?");
    const player = playerStmt.get(playerIdParam) as
      | PlayerForBidding
      | undefined;
    if (!player) throw new Error(`Player with ID ${playerIdParam} not found.`);
    console.log("[SERVICE DEBUG] placeInitialBid: Player Role:", player?.role);

    if (league.active_auction_roles && league.active_auction_roles !== "ALL") {
      const activeRoles = league.active_auction_roles.split(",");
      if (!activeRoles.includes(player.role)) {
        throw new Error(
          `Player's role (${player.role}) is not currently active for bidding in this league (active roles: ${league.active_auction_roles}).`
        );
      }
    }
    const assignmentStmt = db.prepare(
      "SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?"
    );
    if (assignmentStmt.get(leagueIdParam, playerIdParam))
      throw new Error(
        `Player ${playerIdParam} has already been assigned in league ${leagueIdParam}.`
      );
    const existingAuctionStmt = db.prepare(
      "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')"
    );
    if (existingAuctionStmt.get(leagueIdParam, playerIdParam))
      throw new Error(
        `An active auction already exists for player ${playerIdParam} in league ${leagueIdParam}.`
      );

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participant = participantStmt.get(
      leagueIdParam,
      bidderUserIdParam
    ) as ParticipantForBidding | undefined;
    if (!participant)
      throw new Error(
        `User ${bidderUserIdParam} is not a participant in league ${leagueIdParam}.`
      );

    checkSlotsAndBudgetOrThrow(
      league,
      player,
      participant,
      bidderUserIdParam,
      bidAmountParam,
      true,
      playerIdParam
    );

    const now = Math.floor(Date.now() / 1000);
    const auctionDurationSeconds = league.timer_duration_hours * 60 * 60;
    const scheduledEndTime = now + auctionDurationSeconds;
    const createAuctionStmt = db.prepare(
      `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at) VALUES (@param_league_id, @param_player_id, @param_start_time, @param_scheduled_end_time, @param_bidAmount, @param_bidderUserId, 'active', @param_now, @param_now)`
    );
    const auctionInfo = createAuctionStmt.run({
      param_league_id: leagueIdParam,
      param_player_id: playerIdParam,
      param_start_time: now,
      param_scheduled_end_time: scheduledEndTime,
      param_bidAmount: bidAmountParam,
      param_bidderUserId: bidderUserIdParam,
      param_now: now,
    });
    const newAuctionId = auctionInfo.lastInsertRowid as number;
    if (!newAuctionId) throw new Error("Failed to create auction.");
    console.log(`[SERVICE BID] Auction created ID: ${newAuctionId}`);
    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (@param_auction_id, @param_user_id, @param_amount, @param_bid_time, 'manual')`
    );
    const bidInfo = createBidStmt.run({
      param_auction_id: newAuctionId,
      param_user_id: bidderUserIdParam,
      param_amount: bidAmountParam,
      param_bid_time: now,
    });
    const newBidId = bidInfo.lastInsertRowid as number;
    if (!newBidId) throw new Error("Failed to record bid.");
    console.log(`[SERVICE BID] Bid recorded ID: ${newBidId}`);
    return {
      auction_id: newAuctionId,
      player_id: playerIdParam,
      league_id: leagueIdParam,
      current_bid: bidAmountParam,
      current_winner_id: bidderUserIdParam,
      scheduled_end_time: scheduledEndTime,
      status: "active",
      new_bid_id: newBidId,
    };
  })();
};

export const placeBidOnExistingAuction = async (
  auctionIdParam: number,
  bidderUserIdParam: string,
  bidAmountFromRequestParam: number,
  bidTypeParam: "manual" | "quick"
): Promise<ExistingAuctionBidResult> => {
  console.log(
    `[SERVICE BID] placeBidOnExistingAuction: auctionId=${auctionIdParam}, bidder=${bidderUserIdParam}, amountReq=${bidAmountFromRequestParam}, type=${bidTypeParam}`
  );
  return db.transaction(() => {
    const auctionStmt = db.prepare(
      "SELECT id, auction_league_id, player_id, current_highest_bid_amount, current_highest_bidder_id, status FROM auctions WHERE id = ?"
    );
    const auction = auctionStmt.get(auctionIdParam) as
      | {
          id: number;
          auction_league_id: number;
          player_id: number;
          current_highest_bid_amount: number;
          current_highest_bidder_id: string | null;
          status: string;
        }
      | undefined;
    if (!auction)
      throw new Error(`Auction with ID ${auctionIdParam} not found.`);
    if (auction.status !== "active" && auction.status !== "closing")
      throw new Error(
        `Auction ${auctionIdParam} is not active or closing (status: ${auction.status}).`
      );

    let finalBidAmount = bidAmountFromRequestParam;
    if (bidTypeParam === "quick") {
      finalBidAmount = auction.current_highest_bid_amount + 1;
      console.log(
        `[SERVICE BID] Quick bid: calculated amount ${finalBidAmount}`
      );
    }
    if (finalBidAmount <= auction.current_highest_bid_amount)
      throw new Error(
        `Bid ${finalBidAmount} must be > current bid ${auction.current_highest_bid_amount}.`
      );
    if (auction.current_highest_bidder_id === bidderUserIdParam)
      throw new Error(
        `User ${bidderUserIdParam} is already the highest bidder.`
      );

    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_hours, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(auction.auction_league_id) as
      | LeagueForBidding
      | undefined;
    if (!league)
      throw new Error(
        `League ${auction.auction_league_id} for auction ${auctionIdParam} not found.`
      );
    if (league.status !== "draft_active" && league.status !== "repair_active")
      throw new Error(
        `Bidding not active for league ${auction.auction_league_id} (status: ${league.status}).`
      );

    const playerStmt = db.prepare("SELECT id, role FROM players WHERE id = ?");
    const player = playerStmt.get(auction.player_id) as
      | PlayerForBidding
      | undefined;
    if (!player)
      throw new Error(
        `Player ${auction.player_id} for auction ${auctionIdParam} not found.`
      );
    console.log(
      "[SERVICE DEBUG] placeBidOnExisting: Player Role:",
      player?.role
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
      "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participant = participantStmt.get(
      auction.auction_league_id,
      bidderUserIdParam
    ) as ParticipantForBidding | undefined;
    if (!participant)
      throw new Error(
        `User ${bidderUserIdParam} not in league ${auction.auction_league_id}.`
      );

    const isTakingOverSlot =
      auction.current_highest_bidder_id !== bidderUserIdParam;
    checkSlotsAndBudgetOrThrow(
      league,
      player,
      participant,
      bidderUserIdParam,
      finalBidAmount,
      isTakingOverSlot,
      auction.player_id
    );

    const now = Math.floor(Date.now() / 1000);
    const auctionDurationSeconds = league.timer_duration_hours * 60 * 60;
    const newScheduledEndTime = now + auctionDurationSeconds;
    const previousWinnerId = auction.current_highest_bidder_id;
    const previousBidAmount = auction.current_highest_bid_amount;
    const updateAuctionStmt = db.prepare(
      `UPDATE auctions SET current_highest_bid_amount = @bid, current_highest_bidder_id = @bidder, scheduled_end_time = @endTime, updated_at = @now WHERE id = @id`
    );
    const updateResult = updateAuctionStmt.run({
      bid: finalBidAmount,
      bidder: bidderUserIdParam,
      endTime: newScheduledEndTime,
      now,
      id: auctionIdParam,
    });
    if (updateResult.changes === 0)
      throw new Error("Failed to update auction.");
    console.log(
      `[SERVICE BID] Auction ${auctionIdParam} updated. New winner: ${bidderUserIdParam}, Bid: ${finalBidAmount}`
    );
    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (@param_auction_id, @param_user_id, @param_amount, @param_bid_time, @param_bid_type)`
    );
    const bidInfo = createBidStmt.run({
      param_auction_id: auctionIdParam,
      param_user_id: bidderUserIdParam,
      param_amount: finalBidAmount,
      param_bid_time: now,
      param_bid_type: bidTypeParam,
    });
    const newBidId = bidInfo.lastInsertRowid as number;
    if (!newBidId) throw new Error("Failed to record new bid.");
    console.log(
      `[SERVICE BID] New bid ID: ${newBidId} for auction ID: ${auctionIdParam}`
    );
    return {
      auction_id: auctionIdParam,
      player_id: auction.player_id,
      league_id: auction.auction_league_id,
      new_current_bid: finalBidAmount,
      new_current_winner_id: bidderUserIdParam,
      new_scheduled_end_time: newScheduledEndTime,
      new_bid_id: newBidId,
      previous_winner_id: previousWinnerId,
      previous_bid_amount: previousBidAmount,
    };
  })();
};

export const getAuctionStatusForPlayer = async (
  leagueIdParam: number,
  playerIdParam: number
): Promise<AuctionStatusDetails | null> => {
  console.log(
    `[SERVICE BID] getAuctionStatusForPlayer: leagueId=${leagueIdParam}, playerId=${playerIdParam}`
  );
  try {
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
       WHERE a.auction_league_id = ? AND a.player_id = ?
       ORDER BY CASE a.status WHEN 'active' THEN 1 WHEN 'closing' THEN 2 ELSE 3 END, a.updated_at DESC
       LIMIT 1`
    );
    const auctionDataFromDb = auctionStmtCorrected.get(
      leagueIdParam,
      playerIdParam
    ) as
      | (AuctionStatusDetails & {
          player_name: string;
          current_highest_bidder_username: string | null;
        })
      | undefined;
    if (!auctionDataFromDb) {
      console.log(
        `[SERVICE BID] No auction found for player ${playerIdParam} in league ${leagueIdParam}.`
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
    const { player_name, current_highest_bidder_username, ...baseAuctionData } =
      auctionDataFromDb;
    const result: AuctionStatusDetails = {
      ...baseAuctionData,
      player_name: player_name,
      current_highest_bidder_username: current_highest_bidder_username,
      bid_history: bidHistory.reverse(),
      time_remaining_seconds: timeRemainingSeconds,
    };
    console.log(
      `[SERVICE BID] Auction status found for player ${playerIdParam} in league ${leagueIdParam}.`
    );
    return result;
  } catch (error) {
    console.error("[SERVICE BID] Error in getAuctionStatusForPlayer:", error);
    throw new Error(
      "Failed to retrieve auction status due to an internal error."
    );
  }
};
