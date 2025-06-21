// src/lib/db/services/bid.service.ts v.2.1
// Servizio per la logica di business relativa alle offerte, alle aste,
// al loro completamento, e alla gestione dei locked_credits.
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
  name?: string;
}

export interface ParticipantForBidding {
  user_id: string;
  current_budget: number;
  locked_credits: number;
  players_P_acquired?: number;
  players_D_acquired?: number;
  players_C_acquired?: number;
  players_A_acquired?: number;
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

interface ExpiredAuctionData {
  id: number;
  auction_league_id: number;
  player_id: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string;
  player_role: string;
  player_name?: string;
}

// 3. Funzione Helper Interna per Controllo Slot e Budget (MODIFICATA per locked_credits)
const checkSlotsAndBudgetOrThrow = (
  league: LeagueForBidding,
  player: PlayerForBidding,
  participant: ParticipantForBidding,
  bidderUserIdForCheck: string,
  bidAmountForCheck: number,
  isNewAuctionAttempt: boolean,
  currentAuctionTargetPlayerId?: number
) => {
  const availableBudget =
    participant.current_budget - participant.locked_credits;
  if (availableBudget < bidAmountForCheck) {
    throw new Error(
      `Insufficient available budget for user ${bidderUserIdForCheck}. Available (Budget - Locked): ${availableBudget}, Bid: ${bidAmountForCheck}. (Total Budget: ${participant.current_budget}, Locked: ${participant.locked_credits})`
    );
  }

  const countAssignedPlayerForRoleStmt = db.prepare(
    `SELECT COUNT(*) as count FROM player_assignments pa JOIN players p ON pa.player_id = p.id
       WHERE pa.auction_league_id = ? AND pa.user_id = ? AND p.role = ?`
  );
  const assignedCountResult = countAssignedPlayerForRoleStmt.get(
    league.id,
    bidderUserIdForCheck,
    player.role
  ) as { count: number };
  const currentlyAssignedForRole = assignedCountResult.count;

  let activeBidsAsWinnerSql = `SELECT COUNT(DISTINCT a.player_id) as count FROM auctions a JOIN players p ON a.player_id = p.id
       WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND p.role = ? AND a.status IN ('active', 'closing')`;
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
    `[SERVICE DEBUG SLOTS] User: ${bidderUserIdForCheck}, Role: ${player.role}, TargetPlayerID: ${player.id ?? currentAuctionTargetPlayerId}`
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
      throw new Error(
        `${slotErrorMessage} (Role: ${player.role}, Max: ${maxSlotsForRole}, Current commitments: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  } else {
    if (slotsVirtuallyOccupiedByOthers >= maxSlotsForRole) {
      // Se sto rilanciando per un giocatore CHE NON SONO IO a detenere, non devo contare questo slot come "nuovo"
      throw new Error(
        `${slotErrorMessage} (Role: ${player.role}, Max: ${maxSlotsForRole}, Current commitments: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  }
  console.log(
    `[SERVICE DEBUG SLOTS] Slot check passed for User: ${bidderUserIdForCheck}, Role: ${player.role}`
  );
};

// 4. Funzioni Esportate del Servizio per le Offerte (MODIFICATE per locked_credits)

const incrementLockedCreditsStmt = db.prepare(
  "UPDATE league_participants SET locked_credits = locked_credits + ?, updated_at = strftime('%s', 'now') WHERE league_id = ? AND user_id = ?"
);
const decrementLockedCreditsStmt = db.prepare(
  "UPDATE league_participants SET locked_credits = locked_credits - ?, updated_at = strftime('%s', 'now') WHERE league_id = ? AND user_id = ?"
);

export const placeInitialBidAndCreateAuction = async (
  leagueIdParam: number,
  playerIdParam: number,
  bidderUserIdParam: string,
  bidAmountParam: number
): Promise<AuctionCreationResult> => {
  console.log(
    `[SERVICE BID] placeInitialBidAndCreateAuction: leagueId=${leagueIdParam}, playerId=${playerIdParam}, bidder=${bidderUserIdParam}, amount=${bidAmountParam}`
  );

  return db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);

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

    checkSlotsAndBudgetOrThrow(
      league,
      player,
      participant,
      bidderUserIdParam,
      bidAmountParam,
      true,
      playerIdParam
    );

    const lockResult = incrementLockedCreditsStmt.run(
      bidAmountParam,
      leagueIdParam,
      bidderUserIdParam
    );
    if (lockResult.changes === 0) {
      throw new Error(
        `Failed to lock credits for user ${bidderUserIdParam} in league ${leagueIdParam}. Participant not found or no update occurred.`
      );
    }
    console.log(
      `[SERVICE BID] Locked ${bidAmountParam} credits for user ${bidderUserIdParam} (Initial Bid).`
    );

    const auctionDurationSeconds = league.timer_duration_hours * 3600;
    const scheduledEndTime = now + auctionDurationSeconds;
    const createAuctionStmt = db.prepare(
      `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    );
    const auctionInfo = createAuctionStmt.run(
      leagueIdParam,
      playerIdParam,
      now,
      scheduledEndTime,
      bidAmountParam,
      bidderUserIdParam,
      now,
      now
    );
    const newAuctionId = auctionInfo.lastInsertRowid as number;
    if (!newAuctionId) throw new Error("Failed to create auction.");

    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, 'manual')`
    );
    const bidInfo = createBidStmt.run(
      newAuctionId,
      bidderUserIdParam,
      bidAmountParam,
      now
    );
    if (!bidInfo.lastInsertRowid) throw new Error("Failed to record bid.");

    return {
      auction_id: newAuctionId,
      player_id: playerIdParam,
      league_id: leagueIdParam,
      current_bid: bidAmountParam,
      current_winner_id: bidderUserIdParam,
      scheduled_end_time: scheduledEndTime,
      status: "active",
      new_bid_id: bidInfo.lastInsertRowid as number,
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
    const now = Math.floor(Date.now() / 1000);

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

    const previousWinnerId = auction.current_highest_bidder_id;
    const previousBidAmount = auction.current_highest_bid_amount;

    let finalBidAmount = bidAmountFromRequestParam;
    if (bidTypeParam === "quick") {
      if (previousBidAmount === null || previousBidAmount < 0)
        throw new Error(
          "Cannot place quick bid on an auction with no valid current bid."
        );
      finalBidAmount = previousBidAmount + 1;
    }
    if (finalBidAmount <= previousBidAmount)
      throw new Error(
        `Bid ${finalBidAmount} must be > current bid ${previousBidAmount}.`
      );
    if (previousWinnerId === bidderUserIdParam)
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

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const newBidderParticipant = participantStmt.get(
      auction.auction_league_id,
      bidderUserIdParam
    ) as ParticipantForBidding | undefined;
    if (!newBidderParticipant)
      throw new Error(
        `User ${bidderUserIdParam} (new bidder) not in league ${auction.auction_league_id}.`
      );

    checkSlotsAndBudgetOrThrow(
      league,
      player,
      newBidderParticipant,
      bidderUserIdParam,
      finalBidAmount,
      previousWinnerId !== bidderUserIdParam,
      auction.player_id
    );

    if (previousWinnerId && previousWinnerId !== bidderUserIdParam) {
      // Sblocca i crediti del precedente miglior offerente
      const unlockResult = decrementLockedCreditsStmt.run(
        previousBidAmount,
        auction.auction_league_id,
        previousWinnerId
      );
      if (unlockResult.changes === 0) {
        console.warn(
          `[SERVICE BID] Failed to unlock credits for previous winner ${previousWinnerId} or participant not found for auction ${auctionIdParam}.`
        );
      } else {
        console.log(
          `[SERVICE BID] Unlocked ${previousBidAmount} credits for previous winner ${previousWinnerId}.`
        );
      }
    }
    // Blocca i crediti per il nuovo miglior offerente
    const lockResult = incrementLockedCreditsStmt.run(
      finalBidAmount,
      auction.auction_league_id,
      bidderUserIdParam
    );
    if (lockResult.changes === 0) {
      throw new Error(
        `Failed to lock credits for new bidder ${bidderUserIdParam} for auction ${auctionIdParam}.`
      );
    }
    console.log(
      `[SERVICE BID] Locked ${finalBidAmount} credits for new bidder ${bidderUserIdParam}.`
    );

    const auctionDurationSeconds = league.timer_duration_hours * 3600;
    const newScheduledEndTime = now + auctionDurationSeconds;
    const updateAuctionStmt = db.prepare(
      `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, status = 'active', updated_at = strftime('%s', 'now') WHERE id = ?`
    );
    updateAuctionStmt.run(
      finalBidAmount,
      bidderUserIdParam,
      newScheduledEndTime,
      auctionIdParam
    );

    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, ?)`
    );
    const bidInfo = createBidStmt.run(
      auctionIdParam,
      bidderUserIdParam,
      finalBidAmount,
      now,
      bidTypeParam
    );
    if (!bidInfo.lastInsertRowid) throw new Error("Failed to record new bid.");

    return {
      auction_id: auctionIdParam,
      player_id: auction.player_id,
      league_id: auction.auction_league_id,
      new_current_bid: finalBidAmount,
      new_current_winner_id: bidderUserIdParam,
      new_scheduled_end_time: newScheduledEndTime,
      new_bid_id: bidInfo.lastInsertRowid as number,
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
    console.error(
      `[SERVICE BID] Error in getAuctionStatusForPlayer for league ${leagueIdParam}, player ${playerIdParam}:`,
      error
    );
    throw new Error(
      "Failed to retrieve auction status due to an internal error."
    );
  }
};

// 5. Funzione Esportata per Processare Aste Scadute e Assegnare Giocatori (MODIFICATA per locked_credits)
export const processExpiredAuctionsAndAssignPlayers = async (): Promise<{
  processedCount: number;
  failedCount: number;
  errors: string[];
}> => {
  console.log(
    "[SERVICE AUCTION_PROCESSING] Starting to process expired auctions..."
  );
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const getExpiredAuctionsStmt = db.prepare(
    `SELECT a.id, a.auction_league_id, a.player_id, a.current_highest_bid_amount, 
            a.current_highest_bidder_id, p.role as player_role, p.name as player_name 
     FROM auctions a JOIN players p ON a.player_id = p.id
     WHERE a.status = 'active' AND a.scheduled_end_time <= ? 
       AND a.current_highest_bidder_id IS NOT NULL AND a.current_highest_bid_amount > 0`
  );
  const expiredAuctions = getExpiredAuctionsStmt.all(
    now
  ) as ExpiredAuctionData[];

  if (expiredAuctions.length === 0) {
    console.log(
      "[SERVICE AUCTION_PROCESSING] No expired auctions to process at this time."
    );
    return { processedCount, failedCount, errors };
  }
  console.log(
    `[SERVICE AUCTION_PROCESSING] Found ${expiredAuctions.length} expired auctions to process.`
  );

  const updateAuctionStatusStmt = db.prepare(
    "UPDATE auctions SET status = 'sold', updated_at = strftime('%s', 'now') WHERE id = ?"
  );
  const updateParticipantBudgetStmt = db.prepare(
    "UPDATE league_participants SET current_budget = current_budget - ?, updated_at = strftime('%s', 'now') WHERE league_id = ? AND user_id = ?"
  );
  const decrementWinnerLockedCreditsStmt = db.prepare(
    // Già definito, ma usato qui
    "UPDATE league_participants SET locked_credits = locked_credits - ?, updated_at = strftime('%s', 'now') WHERE league_id = ? AND user_id = ?"
  );
  const createPlayerAssignmentStmt = db.prepare(
    `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price, assigned_at) VALUES (?, ?, ?, ?, ?)`
  );
  const getPlayerAcquiredCountColumnName = (role: string): string | null => {
    switch (role) {
      case "P":
        return "players_P_acquired";
      case "D":
        return "players_D_acquired";
      case "C":
        return "players_C_acquired";
      case "A":
        return "players_A_acquired";
      default:
        return null;
    }
  };
  const createBudgetTransactionStmt = db.prepare(
    `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, related_auction_id, related_player_id, description, balance_after_in_league, transaction_time) VALUES (@auction_league_id, @user_id, @transaction_type, @amount, @related_auction_id, @related_player_id, @description, @balance_after_in_league, @transaction_time)`
  );
  const getParticipantBudgetStmt = db.prepare(
    "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?"
  );

  for (const auction of expiredAuctions) {
    console.log(
      `[SERVICE AUCTION_PROCESSING] Processing auction ID: ${auction.id} for player ID: ${auction.player_id} (Name: ${auction.player_name || "N/A"})`
    );

    const singleAuctionTransaction = db.transaction(() => {
      updateAuctionStatusStmt.run(auction.id);
      console.log(`  Auction ID ${auction.id} status updated to 'sold'.`);

      updateParticipantBudgetStmt.run(
        auction.current_highest_bid_amount,
        auction.auction_league_id,
        auction.current_highest_bidder_id
      );
      console.log(
        `  Current budget DECREMENTED for user ${auction.current_highest_bidder_id}.`
      );

      const decrementLockResult = decrementWinnerLockedCreditsStmt.run(
        auction.current_highest_bid_amount,
        auction.auction_league_id,
        auction.current_highest_bidder_id
      );
      if (decrementLockResult.changes === 0) {
        console.warn(
          `[SERVICE AUCTION_PROCESSING] Failed to decrement locked_credits for winner ${auction.current_highest_bidder_id} for auction ${auction.id}.`
        );
      } else {
        console.log(
          `  Locked credits DECREMENTED for winner ${auction.current_highest_bidder_id}.`
        );
      }

      const updatedParticipant = getParticipantBudgetStmt.get(
        auction.auction_league_id,
        auction.current_highest_bidder_id
      ) as { current_budget: number } | undefined;
      if (!updatedParticipant)
        throw new Error(
          `Failed to retrieve updated budget for user ${auction.current_highest_bidder_id} after update for auction ID ${auction.id}.`
        );
      createBudgetTransactionStmt.run({
        auction_league_id: auction.auction_league_id,
        user_id: auction.current_highest_bidder_id,
        transaction_type: "win_auction_debit",
        amount: auction.current_highest_bid_amount,
        related_auction_id: auction.id,
        related_player_id: auction.player_id,
        description: `Acquisto giocatore ${auction.player_name || `ID ${auction.player_id}`} per ${auction.current_highest_bid_amount} crediti (Asta ID: ${auction.id}).`,
        balance_after_in_league: updatedParticipant.current_budget,
        transaction_time: now,
      });
      console.log(
        `  Budget transaction (win_auction_debit) logged for user ${auction.current_highest_bidder_id}.`
      );

      const acquiredColumn = getPlayerAcquiredCountColumnName(
        auction.player_role
      );
      if (!acquiredColumn)
        throw new Error(
          `Invalid player role '${auction.player_role}' for player ID ${auction.player_id}.`
        );
      const updatePlayerCountStmt = db.prepare(
        `UPDATE league_participants SET ${acquiredColumn} = ${acquiredColumn} + 1, updated_at = strftime('%s', 'now') WHERE league_id = ? AND user_id = ?`
      );
      updatePlayerCountStmt.run(
        auction.auction_league_id,
        auction.current_highest_bidder_id
      );
      console.log(
        `  Player count for role ${auction.player_role} updated for user ${auction.current_highest_bidder_id}.`
      );

      createPlayerAssignmentStmt.run(
        auction.auction_league_id,
        auction.player_id,
        auction.current_highest_bidder_id,
        auction.current_highest_bid_amount,
        now
      );
      console.log(
        `  Player assignment created for player ID ${auction.player_id}.`
      );

      return true;
    });

    try {
      singleAuctionTransaction();
      processedCount++;
    } catch (error) {
      failedCount++;
      const errMsg =
        error instanceof Error
          ? error.message
          : "Unknown error processing auction.";
      console.error(
        `[SERVICE AUCTION_PROCESSING] Error processing auction ID ${auction.id}: ${errMsg}`,
        error
      );
      errors.push(`Auction ID ${auction.id}: ${errMsg}`);
    }
  }

  console.log(
    `[SERVICE AUCTION_PROCESSING] Finished. Processed: ${processedCount}, Failed: ${failedCount}.`
  );
  if (errors.length > 0)
    console.error("[SERVICE AUCTION_PROCESSING] Errors:", errors);
  return { processedCount, failedCount, errors };
};
