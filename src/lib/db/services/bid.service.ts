// src/lib/db/services/bid.service.ts v.2.2
// Servizio completo per la logica delle offerte, con integrazione Socket.IO per notifiche in tempo reale.
// 1. Importazioni
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";
import { handleBidderChange } from "./auction-states.service";
import { canUserBidOnPlayer, getUserCooldownInfo } from "./response-timer.service";

// 2. Tipi e Interfacce Esportate
export type AppRole = "admin" | "manager";

export interface LeagueForBidding {
  id: number;
  status: string;
  active_auction_roles: string | null;
  min_bid: number;
  timer_duration_minutes: number;
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

interface PlaceBidParams {
  leagueId: number;
  playerId: number;
  userId: string;
  bidAmount: number;
  bidType?: "manual" | "quick" | "auto";
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
  const availableBudget =
    participant.current_budget - participant.locked_credits;
  if (availableBudget < bidAmountForCheck) {
    throw new Error(
      `Budget disponibile insufficiente. Disponibile: ${availableBudget}, Offerta: ${bidAmountForCheck}.`
    );
  }

  const countAssignedPlayerForRoleStmt = db.prepare(
    `SELECT COUNT(*) as count FROM player_assignments pa JOIN players p ON pa.player_id = p.id WHERE pa.auction_league_id = ? AND pa.user_id = ? AND p.role = ?`
  );
  const assignedCountResult = countAssignedPlayerForRoleStmt.get(
    league.id,
    bidderUserIdForCheck,
    player.role
  ) as { count: number };
  const currentlyAssignedForRole = assignedCountResult.count;

  let activeBidsAsWinnerSql = `SELECT COUNT(DISTINCT a.player_id) as count FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND p.role = ? AND a.status IN ('active', 'closing')`;
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
      throw new Error(
        `Ruolo giocatore non valido (${player.role}) per il controllo degli slot.`
      );
  }

  const slotErrorMessage =
    "Slot pieni, non puoi offrire per altri giocatori di questo ruolo";
  if (isNewAuctionAttempt) {
    if (slotsVirtuallyOccupiedByOthers + 1 > maxSlotsForRole) {
      throw new Error(
        `${slotErrorMessage} (Ruolo: ${player.role}, Max: ${maxSlotsForRole}, Impegni attuali: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  } else {
    if (slotsVirtuallyOccupiedByOthers >= maxSlotsForRole) {
      throw new Error(
        `${slotErrorMessage} (Ruolo: ${player.role}, Max: ${maxSlotsForRole}, Impegni attuali: ${slotsVirtuallyOccupiedByOthers})`
      );
    }
  }
};

// 4. Funzioni Esportate del Servizio per le Offerte
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
  const result = db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);
    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(leagueIdParam) as
      | LeagueForBidding
      | undefined;
    if (!league) throw new Error(`Lega con ID ${leagueIdParam} non trovata.`);
    if (league.status !== "draft_active" && league.status !== "repair_active")
      throw new Error(
        `Le offerte non sono attive per la lega (status: ${league.status}).`
      );
    if (bidAmountParam < league.min_bid)
      throw new Error(
        `L'offerta è inferiore all'offerta minima di ${league.min_bid}.`
      );

    const playerStmt = db.prepare("SELECT id, role FROM players WHERE id = ?");
    const player = playerStmt.get(playerIdParam) as
      | PlayerForBidding
      | undefined;
    if (!player)
      throw new Error(`Giocatore con ID ${playerIdParam} non trovato.`);

    // Check if player role is in active auction roles
    if (league.active_auction_roles) {
      const activeRoles = league.active_auction_roles.toUpperCase() === "ALL" 
        ? ["P", "D", "C", "A"] 
        : league.active_auction_roles.split(",").map(r => r.trim().toUpperCase());
      
      if (!activeRoles.includes(player.role.toUpperCase())) {
        throw new Error(`Le aste per il ruolo ${player.role} non sono attualmente attive. Ruoli attivi: ${league.active_auction_roles}`);
      }
    }

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participant = participantStmt.get(
      leagueIdParam,
      bidderUserIdParam
    ) as ParticipantForBidding | undefined;
    if (!participant)
      throw new Error(
        `Utente ${bidderUserIdParam} non partecipa alla lega ${leagueIdParam}.`
      );

    const assignmentStmt = db.prepare(
      "SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?"
    );
    if (assignmentStmt.get(leagueIdParam, playerIdParam))
      throw new Error(
        `Giocatore ${playerIdParam} già assegnato in questa lega.`
      );

    // Check if user is in cooldown for this player (48h after abandoning)
    const cooldownInfo = getUserCooldownInfo(bidderUserIdParam, playerIdParam);
    if (!cooldownInfo.canBid) {
      throw new Error(cooldownInfo.message || "Non puoi avviare un'asta per questo giocatore. Hai un cooldown attivo.");
    }

    const existingAuctionStmt = db.prepare(
      "SELECT id, scheduled_end_time, status FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')"
    );
    const existingAuction = existingAuctionStmt.get(leagueIdParam, playerIdParam) as {id: number, scheduled_end_time: number, status: string} | undefined;
    if (existingAuction) {
      // Check if existing auction has expired and should be processed
      if (existingAuction.scheduled_end_time <= now) {
        throw new Error(
          `Esiste un'asta scaduta per il giocatore ${playerIdParam}. Contatta l'amministratore per processare le aste scadute.`
        );
      }
      throw new Error(
        `Esiste già un'asta attiva per il giocatore ${playerIdParam}.`
      );
    }

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
    if (lockResult.changes === 0)
      throw new Error(
        `Impossibile bloccare i crediti per l'utente ${bidderUserIdParam}.`
      );

    const auctionDurationSeconds = league.timer_duration_minutes * 60;
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
    if (!newAuctionId) throw new Error("Creazione asta fallita.");

    const createBidStmt = db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, 'manual')`
    );
    const bidInfo = createBidStmt.run(
      newAuctionId,
      bidderUserIdParam,
      bidAmountParam,
      now
    );
    if (!bidInfo.lastInsertRowid)
      throw new Error("Registrazione offerta fallita.");

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

  // **NUOVO**: Notifica Socket.IO dopo che la transazione ha avuto successo
  if (result.auction_id) {
    await notifySocketServer({
      room: `league-${leagueIdParam}`,
      event: "auction-created",
      data: {
        playerId: result.player_id,
        auctionId: result.auction_id,
        newPrice: result.current_bid,
        highestBidderId: result.current_winner_id,
        scheduledEndTime: result.scheduled_end_time,
      },
    });
  }
  return result;
};

export async function placeBidOnExistingAuction({
  leagueId,
  userId,
  playerId,
  bidAmount,
  bidType = "manual",
}: PlaceBidParams) {
  const transaction = db.transaction(() => {
    // --- Blocco 1: Recupero Dati e Validazione Iniziale ---
    const auction = db
      .prepare(
        `SELECT id, current_highest_bid_amount, current_highest_bidder_id, scheduled_end_time FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'`
      )
      .get(leagueId, playerId) as
      | {
          id: number;
          current_highest_bid_amount: number;
          current_highest_bidder_id: string | null;
          scheduled_end_time: number;
        }
      | undefined;
    if (!auction) throw new Error("Asta non trovata o non più attiva.");
    
    // Check if auction has expired
    const now = Math.floor(Date.now() / 1000);
    if (auction.scheduled_end_time <= now) {
      throw new Error("L'asta è scaduta. Non è più possibile fare offerte.");
    }

    // Check if user is in cooldown for this player (48h after abandoning)
    const cooldownInfo = getUserCooldownInfo(userId, playerId);
    if (!cooldownInfo.canBid) {
      throw new Error(cooldownInfo.message || "Non puoi fare offerte per questo giocatore. Hai un cooldown attivo.");
    }

    const league = db
      .prepare(
        `SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?`
      )
      .get(leagueId) as LeagueForBidding | undefined;
    if (!league) throw new Error("Lega non trovata.");

    // Ottieni l'ID del miglior offerente attuale prima di qualsiasi controllo
    const previousHighestBidderId = auction.current_highest_bidder_id;

    // First, process the user's bid normally if it's valid
    if (bidAmount <= auction.current_highest_bid_amount) {
      throw new Error("L'offerta deve essere superiore all'offerta attuale.");
    }
    
    // Check if user is already highest bidder, but allow if they can counter-bid
    if (previousHighestBidderId === userId) {
      // Con il nuovo sistema di stati, controlliamo se l'utente può fare rilancio
      const canCounterBid = db.prepare(`
        SELECT 1 FROM user_auction_response_timers 
        WHERE auction_id = ? AND user_id = ? AND status = 'pending'
      `).get(auction.id, userId);
      
      if (!canCounterBid) {
        throw new Error("Sei già il miglior offerente.");
      }
      
      console.log(`[BID_SERVICE] User ${userId} is highest bidder but can counter-bid`);
    }

    // --- Blocco 2: Validazione Avanzata Budget e Slot (CORRETTO) ---
    const player = db
      .prepare(`SELECT id, role FROM players WHERE id = ?`)
      .get(playerId) as PlayerForBidding | undefined;
    if (!player) throw new Error(`Giocatore con ID ${playerId} non trovato.`);

    // Check if player role is in active auction roles
    if (league.active_auction_roles) {
      const activeRoles = league.active_auction_roles.toUpperCase() === "ALL" 
        ? ["P", "D", "C", "A"] 
        : league.active_auction_roles.split(",").map(r => r.trim().toUpperCase());
      
      if (!activeRoles.includes(player.role.toUpperCase())) {
        throw new Error(`Le aste per il ruolo ${player.role} non sono attualmente attive. Ruoli attivi: ${league.active_auction_roles}`);
      }
    }
    const participant = db
      .prepare(
        `SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`
      )
      .get(leagueId, userId) as ParticipantForBidding | undefined;
    if (!participant)
      throw new Error(
        `Utente ${userId} non è un partecipante della lega ${leagueId}.`
      );
    checkSlotsAndBudgetOrThrow(
      league,
      player,
      participant,
      userId,
      bidAmount,
      false,
      playerId
    );

    // --- Blocco 3: Gestione Crediti Bloccati ---
    if (previousHighestBidderId) {
      const previousBid = db
        .prepare(
          `SELECT amount FROM bids WHERE auction_id = ? AND user_id = ? ORDER BY amount DESC LIMIT 1`
        )
        .get(auction.id, previousHighestBidderId) as
        | { amount: number }
        | undefined;
      if (previousBid) {
        decrementLockedCreditsStmt.run(
          previousBid.amount,
          leagueId,
          previousHighestBidderId
        );
      }
    }
    incrementLockedCreditsStmt.run(bidAmount, leagueId, userId);

    // --- Blocco 4: Aggiornamento Asta e Inserimento Nuova Offerta ---
    const newScheduledEndTime =
      Math.floor(Date.now() / 1000) + league.timer_duration_minutes * 60;
    db.prepare(
      `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, updated_at = strftime('%s', 'now') WHERE id = ?`
    ).run(bidAmount, userId, newScheduledEndTime, auction.id);
    db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, strftime('%s', 'now'), ?)`
    ).run(auction.id, userId, bidAmount, bidType);

    // --- Blocco 5: Check for Auto-Bid Activation (eBay Logic) ---
    // After user's bid is processed, check if any auto-bids should activate
    
    // First, check if the current bidder also has an auto-bid for this auction
    const currentBidderAutoBid = db
      .prepare(
        `SELECT ab.max_amount, ab.created_at
         FROM auto_bids ab
         WHERE ab.auction_id = ? AND ab.user_id = ? AND ab.is_active = TRUE`
      )
      .get(auction.id, userId) as {max_amount: number, created_at: number} | undefined;
    
    // Get all other active auto-bids for this auction (excluding current bidder)
    const competingAutoBids = db
      .prepare(
        `SELECT ab.user_id, ab.max_amount, ab.created_at, u.username
         FROM auto_bids ab
         JOIN users u ON ab.user_id = u.id
         WHERE ab.auction_id = ? AND ab.is_active = TRUE AND ab.user_id != ?
         ORDER BY ab.created_at ASC`
      )
      .all(auction.id, userId) as Array<{user_id: string, max_amount: number, created_at: number, username: string}>;
    
    if (competingAutoBids.length > 0) {
      // Find the auto-bid that should win based on eBay logic
      let winningAutoBid = null;
      let finalBidAmount = bidAmount;
      
      if (currentBidderAutoBid) {
        // Case: Auto-bid vs Auto-bid
        // Find the highest auto-bid, with time priority for ties
        const allAutoBids = [
          {
            user_id: userId,
            max_amount: currentBidderAutoBid.max_amount,
            created_at: currentBidderAutoBid.created_at,
            username: 'current_user'
          },
          ...competingAutoBids
        ];
        
        // Sort by max_amount DESC, then by created_at ASC (earlier wins)
        allAutoBids.sort((a, b) => {
          if (a.max_amount !== b.max_amount) {
            return b.max_amount - a.max_amount; // Higher amount wins
          }
          return a.created_at - b.created_at; // Earlier time wins
        });
        
        const winner = allAutoBids[0];
        const secondHighest = allAutoBids[1];
        
        if (winner.user_id !== userId) {
          // Competing auto-bid wins
          winningAutoBid = winner;
          if (secondHighest) {
            // Set final amount to second highest max + 1, but not exceeding winner's max
            finalBidAmount = Math.min(secondHighest.max_amount + 1, winner.max_amount);
          } else {
            // No second bidder, set to current bid + 1
            finalBidAmount = bidAmount + 1;
          }
        } else {
          // Current user's auto-bid wins
          if (secondHighest) {
            // Set final amount to second highest max + 1, but not exceeding current user's max
            finalBidAmount = Math.min(secondHighest.max_amount + 1, currentBidderAutoBid.max_amount);
            // Current user already has the winning bid, just update the amount
            if (finalBidAmount > bidAmount) {
              // Update the current bid to the calculated amount
              db.prepare(
                `UPDATE auctions SET current_highest_bid_amount = ?, updated_at = strftime('%s', 'now') WHERE id = ?`
              ).run(finalBidAmount, auction.id);
              
              // Update the bid record
              db.prepare(
                `UPDATE bids SET amount = ? WHERE auction_id = ? AND user_id = ? AND bid_time = (
                  SELECT MAX(bid_time) FROM bids WHERE auction_id = ? AND user_id = ?
                )`
              ).run(finalBidAmount, auction.id, userId, auction.id, userId);
              
              // Update locked credits
              const creditDifference = finalBidAmount - bidAmount;
              incrementLockedCreditsStmt.run(creditDifference, leagueId, userId);
            }
          }
          // Current user keeps the bid, no auto-bid activation needed
          winningAutoBid = null;
        }
      } else {
        // Case: Manual bid vs Auto-bid
        // Find the earliest auto-bid that can beat the current bid
        const eligibleAutoBids = competingAutoBids.filter(ab => ab.max_amount > bidAmount);
        
        if (eligibleAutoBids.length > 0) {
          winningAutoBid = eligibleAutoBids[0]; // First come, first serve
          finalBidAmount = bidAmount + 1; // Beat manual bid by 1
        }
      }
      
      // Process the winning auto-bid if there is one
      if (winningAutoBid && winningAutoBid.user_id !== userId) {
        console.log(`Auto-bid activation: User ${winningAutoBid.user_id} winning with ${finalBidAmount} against ${userId}'s bid of ${bidAmount}`);
        
        // Validate auto-bidder's budget and slots
        const autoBidder = db
          .prepare(
            `SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`
          )
          .get(leagueId, winningAutoBid.user_id) as ParticipantForBidding | undefined;
        
        if (autoBidder) {
          try {
            checkSlotsAndBudgetOrThrow(
              league,
              player,
              autoBidder,
              winningAutoBid.user_id,
              finalBidAmount,
              false,
              playerId
            );
            
            // Process auto-bid
            // First unlock credits from the user who just bid
            decrementLockedCreditsStmt.run(bidAmount, leagueId, userId);
            
            // Lock credits for auto-bidder
            incrementLockedCreditsStmt.run(finalBidAmount, leagueId, winningAutoBid.user_id);
            
            // Update auction with auto-bid
            const autoBidScheduledEndTime = Math.floor(Date.now() / 1000) + league.timer_duration_minutes * 60;
            db.prepare(
              `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, updated_at = strftime('%s', 'now') WHERE id = ?`
            ).run(finalBidAmount, winningAutoBid.user_id, autoBidScheduledEndTime, auction.id);
            
            // Insert auto-bid record
            db.prepare(
              `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, strftime('%s', 'now'), 'auto')`
            ).run(auction.id, winningAutoBid.user_id, finalBidAmount);
            
            return {
              success: true,
              previousHighestBidderId: userId,
              newScheduledEndTime: autoBidScheduledEndTime,
              playerName: db
                .prepare(`SELECT name FROM players WHERE id = ?`)
                .get(playerId) as { name: string } | undefined,
              autoBidActivated: true,
              autoBidUserId: winningAutoBid.user_id,
              autoBidUsername: winningAutoBid.username,
              autoBidAmount: finalBidAmount
            };
          } catch (error) {
            // Auto-bid failed (budget/slots), continue with original bid
            console.log(`Auto-bid failed for user ${winningAutoBid.user_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }

    return {
      success: true,
      previousHighestBidderId,
      newScheduledEndTime,
      playerName: db
        .prepare(`SELECT name FROM players WHERE id = ?`)
        .get(playerId) as { name: string } | undefined,
    };
  });

  const result = transaction();

  // --- Blocco 6: Invio Notifiche Socket.IO ---
  if (result.success) {
    const finalBidAmount = result.autoBidActivated ? result.autoBidAmount : bidAmount;
    const finalBidderId = result.autoBidActivated ? result.autoBidUserId : userId;
    
    await notifySocketServer({
      room: `league-${leagueId}`,
      event: "auction-update",
      data: {
        playerId,
        newPrice: finalBidAmount,
        highestBidderId: finalBidderId,
        scheduledEndTime: result.newScheduledEndTime,
        autoBidActivated: result.autoBidActivated || false,
      },
    });
    
    if (result.autoBidActivated) {
      // Notify the original bidder that their bid was immediately countered by auto-bid
      await notifySocketServer({
        room: `user-${userId}`,
        event: "bid-surpassed-notification",
        data: {
          playerName: result.playerName?.name || "Giocatore",
          newBidAmount: result.autoBidAmount,
          autoBidActivated: true,
          autoBidUsername: result.autoBidUsername,
        },
      });
      
      // Notify the auto-bidder that their auto-bid was activated
      await notifySocketServer({
        room: `user-${result.autoBidUserId}`,
        event: "auto-bid-activated-notification",
        data: {
          playerName: result.playerName?.name || "Giocatore",
          bidAmount: result.autoBidAmount,
          triggeredBy: userId,
        },
      });

      // Gestisci cambio stato per l'utente superato dall'auto-bid
      const auctionInfo = db.prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
        .get(leagueId, playerId) as { id: number } | undefined;
      
      if (auctionInfo) {
        console.log(`[BID_SERVICE] Handling state change for user ${userId} (surpassed by auto-bid), auction ${auctionInfo.id}`);
        await handleBidderChange(auctionInfo.id, userId, result.autoBidUserId!);
      }
    } else if (result.previousHighestBidderId) {
      // Normal bid surpassed notification
      await notifySocketServer({
        room: `user-${result.previousHighestBidderId}`,
        event: "bid-surpassed-notification",
        data: {
          playerName: result.playerName?.name || "Giocatore",
          newBidAmount: bidAmount,
          autoBidActivated: false,
        },
      });

      // Gestisci cambio stato per l'utente superato
      const auctionInfo = db.prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
        .get(leagueId, playerId) as { id: number } | undefined;
      
      if (auctionInfo) {
        console.log(`[BID_SERVICE] Handling state change for user ${result.previousHighestBidderId}, auction ${auctionInfo.id}`);
        await handleBidderChange(auctionInfo.id, result.previousHighestBidderId, userId);
      } else {
        console.warn(`[BID_SERVICE] No active auction found for league ${leagueId}, player ${playerId}`);
      }

    }

    // Con il sistema degli stati, non abbiamo più bisogno di gestire timer qui
    // Lo stato 'miglior_offerta' viene gestito automaticamente dalla query getUserAuctionState
    console.log(`[BID_SERVICE] User ${userId} is now highest bidder - state will be automatically 'miglior_offerta'`);
  }
  
  const message = result.autoBidActivated 
    ? `Offerta piazzata! Auto-bid di ${result.autoBidUsername} attivata a ${result.autoBidAmount} crediti.`
    : "Offerta piazzata con successo!";
    
  return { message };
}

export const getAuctionStatusForPlayer = async (
  leagueIdParam: number,
  playerIdParam: number
): Promise<AuctionStatusDetails | null> => {
  const auctionStmt = db.prepare(
    `SELECT a.id, a.auction_league_id AS league_id, a.player_id, a.start_time, a.scheduled_end_time, a.current_highest_bid_amount, a.current_highest_bidder_id, a.status, a.created_at, a.updated_at, p.name AS player_name, u.username AS current_highest_bidder_username FROM auctions a JOIN players p ON a.player_id = p.id LEFT JOIN users u ON a.current_highest_bidder_id = u.id WHERE a.auction_league_id = ? AND a.player_id = ? ORDER BY CASE a.status WHEN 'active' THEN 1 WHEN 'closing' THEN 2 ELSE 3 END, a.updated_at DESC LIMIT 1`
  );
  const auctionData = auctionStmt.get(leagueIdParam, playerIdParam) as
    | (Omit<AuctionStatusDetails, "bid_history" | "time_remaining_seconds"> & {
        player_name: string;
        current_highest_bidder_username: string | null;
      })
    | undefined;
  if (!auctionData) return null;

  const bidsStmt = db.prepare(
    `SELECT b.id, b.auction_id, b.user_id, b.amount, b.bid_time, b.bid_type, u.username as bidder_username FROM bids b JOIN users u ON b.user_id = u.id WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 10`
  );
  const bidHistory = bidsStmt.all(auctionData.id) as BidRecord[];

  const timeRemainingSeconds =
    auctionData.status === "active" || auctionData.status === "closing"
      ? Math.max(
          0,
          auctionData.scheduled_end_time - Math.floor(Date.now() / 1000)
        )
      : undefined;

  return {
    ...auctionData,
    bid_history: bidHistory.reverse(),
    time_remaining_seconds: timeRemainingSeconds,
  };
};

export const processExpiredAuctionsAndAssignPlayers = async (): Promise<{
  processedCount: number;
  failedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  const getExpiredAuctionsStmt = db.prepare(
    `SELECT a.id, a.auction_league_id, a.player_id, a.current_highest_bid_amount, a.current_highest_bidder_id, p.role as player_role, p.name as player_name FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.status = 'active' AND a.scheduled_end_time <= ? AND a.current_highest_bidder_id IS NOT NULL AND a.current_highest_bid_amount > 0`
  );
  const expiredAuctions = getExpiredAuctionsStmt.all(
    now
  ) as ExpiredAuctionData[];

  if (expiredAuctions.length === 0)
    return { processedCount: 0, failedCount: 0, errors: [] };

  let processedCount = 0,
    failedCount = 0;
  const errors: string[] = [];

  for (const auction of expiredAuctions) {
    try {
      db.transaction(() => {
        db.prepare(
          "UPDATE auctions SET status = 'sold', updated_at = ? WHERE id = ?"
        ).run(now, auction.id);
        db.prepare(
          "UPDATE league_participants SET current_budget = current_budget - ?, locked_credits = locked_credits - ? WHERE league_id = ? AND user_id = ?"
        ).run(
          auction.current_highest_bid_amount,
          auction.current_highest_bid_amount,
          auction.auction_league_id,
          auction.current_highest_bidder_id
        );
        const newBalance = (
          db
            .prepare(
              "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?"
            )
            .get(
              auction.auction_league_id,
              auction.current_highest_bidder_id
            ) as { current_budget: number }
        ).current_budget;
        db.prepare(
          `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, related_auction_id, related_player_id, description, balance_after_in_league, transaction_time) VALUES (?, ?, 'win_auction_debit', ?, ?, ?, ?, ?, ?)`
        ).run(
          auction.auction_league_id,
          auction.current_highest_bidder_id,
          auction.current_highest_bid_amount,
          auction.id,
          auction.player_id,
          `Acquisto ${auction.player_name || `ID ${auction.player_id}`}`,
          newBalance,
          now
        );
        const col = `players_${auction.player_role}_acquired`;
        db.prepare(
          `UPDATE league_participants SET ${col} = ${col} + 1, updated_at = ? WHERE league_id = ? AND user_id = ?`
        ).run(
          now,
          auction.auction_league_id,
          auction.current_highest_bidder_id
        );
        db.prepare(
          `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price, assigned_at) VALUES (?, ?, ?, ?, ?)`
        ).run(
          auction.auction_league_id,
          auction.player_id,
          auction.current_highest_bidder_id,
          auction.current_highest_bid_amount,
          now
        );
      })();

      processedCount++;

      // **NUOVO**: Notifica Socket.IO per l'asta conclusa
      await notifySocketServer({
        room: `league-${auction.auction_league_id}`,
        event: "auction-closed-notification",
        data: {
          playerId: auction.player_id,
          playerName: auction.player_name,
          winnerId: auction.current_highest_bidder_id,
          finalPrice: auction.current_highest_bid_amount,
        },
      });
    } catch (error) {
      failedCount++;
      const errMsg =
        error instanceof Error ? error.message : "Errore sconosciuto.";
      errors.push(`Asta ID ${auction.id}: ${errMsg}`);
    }
  }
  return { processedCount, failedCount, errors };
};
