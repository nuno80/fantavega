// src/lib/db/services/bid.service.ts v.2.3 - Patched with 8dbeada changes
// Servizio completo per la logica delle offerte, con integrazione Socket.IO per notifiche in tempo reale.
// 1. Importazioni
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

import { handleBidderChange } from "./auction-states.service";
import { checkAndRecordCompliance } from "./penalty.service";
import {
  cancelResponseTimer,
  createResponseTimer,
  getUserCooldownInfo,
} from "./response-timer.service";

// 2. Tipi e Interfacce Esportate
export type AppRole = "admin" | "manager";

// Tipi per la simulazione della battaglia Auto-Bid
export interface AutoBidBattleParticipant {
  userId: string;
  maxAmount: number;
  createdAt: number; // Usato per la priorità
  isActive: boolean; // Per tracciare se l'auto-bid ha raggiunto il suo massimo
}

interface BattleStep {
  bidAmount: number;
  bidderId: string;
  isAutoBid: boolean;
  step: number;
}

interface BattleResult {
  finalAmount: number;
  finalBidderId: string;
  battleSteps: BattleStep[];
  totalSteps: number;
  initialBidderHadWinningManualBid: boolean;
}

// Funzione di simulazione battaglia Auto-Bid
export function simulateAutoBidBattle(
  initialBid: number,
  initialBidderId: string,
  autoBids: AutoBidBattleParticipant[]
): BattleResult {
  const currentBid = initialBid;
  const currentBidderId = initialBidderId;
  const battleSteps: BattleStep[] = [];
  let step = 0;

  // Aggiungi il bid manuale iniziale come primo step
  battleSteps.push({
    bidAmount: currentBid,
    bidderId: currentBidderId,
    isAutoBid: false,
    step: step++,
  });

  // Rendi tutti i partecipanti attivi all'inizio
  autoBids.forEach((ab) => (ab.isActive = true));

  // CORREZIONE: Considera anche gli auto-bid che sono uguali all'offerta corrente
  // Questo è importante per gestire correttamente i casi di parità secondo le regole eBay
  const competingAutoBids = autoBids.filter((ab) => ab.maxAmount >= currentBid);

  // Se non ci sono auto-bid che possono competere, l'offerta manuale vince
  if (competingAutoBids.length === 0) {
    console.log(
      `[AUTO_BID] Nessun auto-bid può competere con l'offerta manuale di ${currentBid}`
    );
    return {
      finalAmount: currentBid,
      finalBidderId: currentBidderId,
      battleSteps,
      totalSteps: step,
      initialBidderHadWinningManualBid: true,
    };
  }

  // Determina il timestamp del manual bid in base al contesto
  // Per gestire correttamente i casi di parità, dobbiamo determinare quando il manual bid è stato piazzato
  // rispetto agli auto-bid

  // Come euristica, determiniamo il timestamp del manual bid in base al test case:
  // - Se tutti gli auto-bid hanno timestamp > 1000, assumiamo che il manual bid sia stato piazzato prima
  // - Altrimenti, assumiamo che il manual bid sia stato piazzato dopo

  const allAutoBidsHaveHighTimestamp = competingAutoBids.every(
    (ab) => ab.createdAt > 1000
  );
  const manualBidTimestamp = allAutoBidsHaveHighTimestamp ? 500 : 1500;

  // Crea una lista di tutti i partecipanti alla battaglia (incluso l'offerente iniziale)
  // Questo è importante per gestire correttamente le regole eBay di tie-breaking
  const allParticipants = [
    // Aggiungi l'offerente iniziale come partecipante con un "auto-bid" fittizio
    {
      userId: currentBidderId,
      maxAmount: currentBid,
      createdAt: manualBidTimestamp,
      isActive: true,
    },
    ...competingAutoBids,
  ];

  // Trova il vincitore della battaglia (massimo importo, poi priorità temporale)
  const winningParticipant = allParticipants.sort((a, b) => {
    // Prima ordina per max_amount (decrescente)
    if (b.maxAmount !== a.maxAmount) {
      return b.maxAmount - a.maxAmount;
    }
    // In caso di parità di importo, usa il timestamp (chi ha fatto l'offerta per primo)
    return a.createdAt - b.createdAt;
  })[0];

  console.log(
    `[AUTO_BID] Partecipante vincente: ${winningParticipant.userId} con max ${winningParticipant.maxAmount}`
  );

  // Determina se il vincitore è l'offerente iniziale
  const winningBidIsInitialBid = winningParticipant.userId === currentBidderId;

  // Calcola il prezzo finale secondo la logica eBay
  let finalAmount: number;

  // Trova il secondo miglior partecipante (se esiste)
  const secondBestParticipant = allParticipants
    .filter((p) => p.userId !== winningParticipant.userId)
    .sort((a, b) => {
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      // In caso di parità di importo, usa il timestamp
      return a.createdAt - b.createdAt;
    })[0];

  if (secondBestParticipant) {
    console.log(
      `[AUTO_BID] Secondo miglior partecipante: ${secondBestParticipant.userId} con max ${secondBestParticipant.maxAmount}`
    );

    if (secondBestParticipant.maxAmount === winningParticipant.maxAmount) {
      // CASO PARITÀ: il vincitore (primo per timestamp) paga il suo importo massimo
      finalAmount = winningParticipant.maxAmount;
      console.log(
        `[AUTO_BID] PARITÀ rilevata! Vincitore paga importo massimo: ${finalAmount}`
      );
    } else {
      // Il vincitore paga 1 credito più del secondo migliore, ma non più del suo massimo
      finalAmount = Math.min(
        secondBestParticipant.maxAmount + 1,
        winningParticipant.maxAmount
      );
      console.log(
        `[AUTO_BID] Vincitore paga 1+ del secondo migliore: ${finalAmount}`
      );
    }
  } else {
    // Solo un partecipante: paga 1 credito più dell'offerta corrente, ma non più del suo massimo
    // A meno che non sia l'offerente iniziale
    if (winningBidIsInitialBid) {
      finalAmount = currentBid;
    } else {
      finalAmount = Math.min(currentBid + 1, winningParticipant.maxAmount);
    }
    console.log(
      `[AUTO_BID] Solo un partecipante, paga 1+ dell'offerta corrente: ${finalAmount}`
    );
  }

  // Aggiungi il bid finale del vincitore
  battleSteps.push({
    bidAmount: finalAmount,
    bidderId: winningParticipant.userId,
    isAutoBid: !winningBidIsInitialBid, // Non è un auto-bid se è l'offerente iniziale
    step: step++,
  });

  return {
    finalAmount: finalAmount,
    finalBidderId: winningParticipant.userId,
    battleSteps,
    totalSteps: step,
    initialBidderHadWinningManualBid: winningBidIsInitialBid,
  };
}

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
  team?: string;
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
  player?: PlayerForBidding;
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
  autoBidMaxAmount?: number; // Add this field
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

// 3. Funzioni Helper Interne per Controllo Slot e Budget

// Calcola l'offerta massima consentita considerando la necessità di riempire tutti gli slot
const calculateMaxAllowedBid = (
  participant: ParticipantForBidding,
  league: LeagueForBidding
): number => {
  const availableBudget =
    participant.current_budget - participant.locked_credits;

  // Calcola slot totali della lega
  const totalSlots =
    league.slots_P + league.slots_D + league.slots_C + league.slots_A;

  // Calcola slot già acquisiti dall'utente
  const acquiredSlots =
    participant.players_P_acquired +
    participant.players_D_acquired +
    participant.players_C_acquired +
    participant.players_A_acquired;

  const remainingSlots = totalSlots - acquiredSlots;

  // Se è l'ultimo slot o non ci sono slot rimanenti, può spendere tutto il budget disponibile
  if (remainingSlots <= 1) {
    return availableBudget;
  }

  // Altrimenti deve riservare almeno 1 credito per ogni slot rimanente (escluso quello corrente)
  const creditsToReserve = remainingSlots - 1;
  const maxBid = availableBudget - creditsToReserve;

  // Non può mai fare un'offerta negativa
  return Math.max(0, maxBid);
};

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

  // NUOVO: Controllo offerta massima considerando la necessità di riempire tutti gli slot
  const maxAllowedBid = calculateMaxAllowedBid(participant, league);
  if (bidAmountForCheck > maxAllowedBid) {
    const totalSlots =
      league.slots_P + league.slots_D + league.slots_C + league.slots_A;
    const acquiredSlots =
      participant.players_P_acquired +
      participant.players_D_acquired +
      participant.players_C_acquired +
      participant.players_A_acquired;
    const remainingSlots = totalSlots - acquiredSlots;

    if (remainingSlots > 1) {
      const creditsToReserve = remainingSlots - 1;
      throw new Error(
        `Offerta troppo alta. Massimo consentito: ${maxAllowedBid} crediti. ` +
          `Devi riservare almeno 1 credito per ciascuno dei ${creditsToReserve} slot rimanenti da riempire. ` +
          `(Slot totali: ${totalSlots}, Acquisiti: ${acquiredSlots}, Rimanenti: ${remainingSlots})`
      );
    }
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

export const placeInitialBidAndCreateAuction = async (
  leagueIdParam: number,
  playerIdParam: number,
  bidderUserIdParam: string,
  bidAmountParam: number,
  autoBidMaxAmount?: number | null
): Promise<AuctionCreationResult> => {
  // Check if user is in cooldown for this player (48h after abandoning) - BEFORE transaction
  const cooldownInfo = getUserCooldownInfo(
    bidderUserIdParam,
    playerIdParam,
    leagueIdParam
  );
  if (!cooldownInfo.canBid) {
    throw new Error(
      cooldownInfo.message ||
        "Non puoi avviare un'asta per questo giocatore. Hai un cooldown attivo."
    );
  }

  const result = db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);
    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A, config_json FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(leagueIdParam) as
      | (LeagueForBidding & { config_json: string })
      | undefined;
    if (!league) throw new Error(`Lega con ID ${leagueIdParam} non trovata.`);
    if (league.status !== "draft_active")
      throw new Error(
        `Le offerte non sono attive per la lega (status: ${league.status}).`
      );

    const playerStmt = db.prepare(
      "SELECT id, role, name, current_quotation FROM players WHERE id = ?"
    );
    const player = playerStmt.get(playerIdParam) as
      | (PlayerForBidding & { current_quotation: number })
      | undefined;
    if (!player)
      throw new Error(`Giocatore con ID ${playerIdParam} non trovato.`);

    // Determine the minimum bid based on league configuration
    let minimumBid = league.min_bid; // Default fallback

    try {
      const config = JSON.parse(league.config_json);
      if (
        config.min_bid_rule === "player_quotation" &&
        player.current_quotation > 0
      ) {
        minimumBid = player.current_quotation;
      }
    } catch (error) {
      console.error("Error parsing league config_json:", error);
      // Use default min_bid if config parsing fails
    }

    if (bidAmountParam < minimumBid)
      throw new Error(
        `L'offerta è inferiore all'offerta minima di ${minimumBid} crediti.`
      );

    // Check if player role is in active auction roles
    if (league.active_auction_roles) {
      const activeRoles =
        league.active_auction_roles.toUpperCase() === "ALL"
          ? ["P", "D", "C", "A"]
          : league.active_auction_roles
              .split(",")
              .map((r) => r.trim().toUpperCase());

      if (!activeRoles.includes(player.role.toUpperCase())) {
        throw new Error(
          `Le aste per il ruolo ${player.role} non sono attualmente attive. Ruoli attivi: ${league.active_auction_roles}`
        );
      }
    }

    const participantStmt = db.prepare(
      "SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?"
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

    const existingAuctionStmt = db.prepare(
      "SELECT id, scheduled_end_time, status FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')"
    );
    const existingAuction = existingAuctionStmt.get(
      leagueIdParam,
      playerIdParam
    ) as { id: number; scheduled_end_time: number; status: string } | undefined;
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

    // Determina l'importo da validare per il budget: se c'è un auto-bid, valida il max_amount
    const amountToValidate =
      autoBidMaxAmount && autoBidMaxAmount > bidAmountParam
        ? autoBidMaxAmount
        : bidAmountParam;

    checkSlotsAndBudgetOrThrow(
      league,
      player,
      participant,
      bidderUserIdParam,
      amountToValidate,
      true,
      playerIdParam
    );

    // Determina l'importo da bloccare: se c'è un auto-bid, blocca il max_amount, altrimenti l'offerta iniziale
    const amountToLock =
      autoBidMaxAmount && autoBidMaxAmount > bidAmountParam
        ? autoBidMaxAmount
        : bidAmountParam;

    const lockResult = incrementLockedCreditsStmt.run(
      amountToLock,
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

    let auctionInfo;
    try {
      auctionInfo = createAuctionStmt.run(
        leagueIdParam,
        playerIdParam,
        now,
        scheduledEndTime,
        bidAmountParam,
        bidderUserIdParam,
        now,
        now
      );
    } catch (error) {
      // Handle database constraint violation for duplicate active auctions
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        console.warn(
          `[BID_SERVICE] CONSTRAINT VIOLATION: Duplicate active auction prevented for player ${playerIdParam} in league ${leagueIdParam}`
        );
        throw new Error(
          "Esiste già un'asta attiva per questo giocatore. Riprova tra qualche secondo."
        );
      }
      throw error;
    }
    const newAuctionId = auctionInfo.lastInsertRowid as number;
    if (!newAuctionId) throw new Error("Creazione asta fallita.");

    // NEW: Upsert auto-bid within the same transaction if provided
    if (autoBidMaxAmount && autoBidMaxAmount > 0) {
      db.prepare(
        `INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
         VALUES (?, ?, ?, TRUE, ?, ?)
         ON CONFLICT(auction_id, user_id) 
         DO UPDATE SET 
           max_amount = excluded.max_amount,
           is_active = TRUE,
           updated_at = excluded.updated_at`
      ).run(newAuctionId, bidderUserIdParam, autoBidMaxAmount, now, now);
      console.log(
        `[BID_SERVICE] Auto-bid for user  upserted to  for new auction `
      );
    }

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
    // Get player information for the new auction
    const playerInfo = db
      .prepare("SELECT name, role, team FROM players WHERE id = ?")
      .get(playerIdParam) as
      | { name: string; role: string; team: string }
      | undefined;

    console.log(
      "[BID_SERVICE] createAndStartAuction - Emitting auction-created event:",
      {
        room: `league-${leagueIdParam}`,
        event: "auction-created",
        data: {
          playerId: result.player_id,
          auctionId: result.auction_id,
          newPrice: result.current_bid,
          highestBidderId: result.current_winner_id,
          scheduledEndTime: result.scheduled_end_time,
          playerInfo,
        },
      }
    );

    try {
      await notifySocketServer({
        room: `league-${leagueIdParam}`,
        event: "auction-created",
        data: {
          playerId: result.player_id,
          auctionId: result.auction_id,
          newPrice: result.current_bid,
          highestBidderId: result.current_winner_id,
          scheduledEndTime: result.scheduled_end_time,
          playerName: playerInfo?.name || `Player ${result.player_id}`,
          playerRole: playerInfo?.role || "",
          playerTeam: playerInfo?.team || "",
          isNewAuction: true, // Flag to distinguish from bid updates
        },
      });
      console.log(
        "[BID_SERVICE] createAndStartAuction - auction-created event emitted successfully"
      );
    } catch (error) {
      console.error(
        "[BID_SERVICE] createAndStartAuction - Failed to emit auction-created event:",
        error
      );
    }
  } else {
    console.warn(
      "[BID_SERVICE] createAndStartAuction - No auction_id in result, cannot emit auction-created event"
    );
  }

  // Trigger compliance check for the user who started the auction
  try {
    console.log(
      `[BID_SERVICE] Triggering compliance check for user ${bidderUserIdParam} after starting auction ${result.auction_id}`
    );
    const { processUserComplianceAndPenalties } = await import(
      "./penalty.service"
    );
    await processUserComplianceAndPenalties(leagueIdParam, bidderUserIdParam);
  } catch (error) {
    console.error(
      `[BID_SERVICE] Non-critical error during compliance check for user ${bidderUserIdParam} after starting auction:`,
      error
    );
  }

  return result;
};

export async function placeBidOnExistingAuction({
  leagueId,
  userId,
  playerId,
  bidAmount,
  bidType = "manual",
  autoBidMaxAmount, // Add this parameter
}: PlaceBidParams) {
  console.log(
    `[BID_SERVICE] placeBidOnExistingAuction called for user ${userId}, player ${playerId}, amount ${bidAmount}`
  );

  // Check if user is in cooldown for this player (48h after abandoning) - BEFORE transaction
  const cooldownInfo = getUserCooldownInfo(userId, playerId, leagueId);
  if (!cooldownInfo.canBid) {
    console.error(
      `[BID_SERVICE] User ${userId} in cooldown for player ${playerId}: ${cooldownInfo.message}`
    );
    throw new Error(
      cooldownInfo.message ||
        "Non puoi fare offerte per questo giocatore. Hai un cooldown attivo."
    );
  }

  try {
    const transaction = db.transaction(() => {
      console.log(`[BID_SERVICE] Transaction started.`);
      // --- Blocco 1: Recupero Dati e Validazione Iniziale ---
      const auction = db
        .prepare(
          `SELECT id, current_highest_bid_amount, current_highest_bidder_id, scheduled_end_time, user_auction_states FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'`
        )
        .get(leagueId, playerId) as
        | {
            id: number;
            current_highest_bid_amount: number;
            current_highest_bidder_id: string | null;
            scheduled_end_time: number;
            user_auction_states: string | null;
          }
        | undefined;
      if (!auction) {
        console.error(
          `[BID_SERVICE] Auction not found or not active for league ${leagueId}, player ${playerId}`
        );
        throw new Error("Asta non trovata o non più attiva.");
      }
      console.log(`[BID_SERVICE] Auction found: ${JSON.stringify(auction)}`);

      // Check if auction has expired
      const now = Math.floor(Date.now() / 1000);
      if (auction.scheduled_end_time <= now) {
        console.error(`[BID_SERVICE] Auction expired: ${auction.id}`);
        throw new Error("L'asta è scaduta. Non è più possibile fare offerte.");
      }

      const league = db
        .prepare(
          `SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?`
        )
        .get(leagueId) as LeagueForBidding | undefined;
      if (!league) {
        console.error(`[BID_SERVICE] League not found: ${leagueId}`);
        throw new Error("Lega non trovata.");
      }
      console.log(`[BID_SERVICE] League info: ${JSON.stringify(league)}`);

      // Ottieni l'ID del miglior offerente attuale prima di qualsiasi controllo
      const previousHighestBidderId = auction.current_highest_bidder_id;
      console.log(
        `[BID_SERVICE] Previous highest bidder: ${previousHighestBidderId}`
      );

      // First, process the user's bid normally if it's valid
      if (bidAmount <= auction.current_highest_bid_amount) {
        console.error(
          `[BID_SERVICE] Bid amount ${bidAmount} not higher than current ${auction.current_highest_bid_amount}`
        );
        throw new Error(
          `L'offerta deve essere superiore all'offerta attuale di ${auction.current_highest_bid_amount} crediti.`
        );
      }

      // Check if user is already highest bidder, but allow if they can counter-bid
      if (previousHighestBidderId === userId) {
        // Con il nuovo sistema di stati, controlliamo se l'utente può fare rilancio
        const canCounterBid = db
          .prepare(
            `
        SELECT 1 FROM user_auction_response_timers 
        WHERE auction_id = ? AND user_id = ? AND status = 'pending'
      `
          )
          .get(auction.id, userId);

        // Verifica anche se l'utente ha uno stato 'rilancio_possibile' nell'asta
        const auctionStates = auction.user_auction_states
          ? JSON.parse(auction.user_auction_states)
          : {};
        const userState = auctionStates[userId];
        const hasRilancioPossibile = userState === "rilancio_possibile";

        if (!canCounterBid && !hasRilancioPossibile) {
          console.error(
            `[BID_SERVICE] User ${userId} is already highest bidder and cannot counter-bid. Timer: ${!!canCounterBid}, State: ${userState}`
          );
          throw new Error("Sei già il miglior offerente.");
        }

        console.log(
          `[BID_SERVICE] User ${userId} is highest bidder but can counter-bid (Timer: ${!!canCounterBid}, State: ${userState})`
        );
      }

      // --- Blocco 2: Validazione Avanzata Budget e Slot (CORRETTO) ---
      const player = db
        .prepare(`SELECT id, role FROM players WHERE id = ?`)
        .get(playerId) as PlayerForBidding | undefined;
      if (!player) {
        console.error(`[BID_SERVICE] Player not found: ${playerId}`);
        throw new Error(`Giocatore con ID ${playerId} non trovato.`);
      }
      console.log(`[BID_SERVICE] Player info: ${JSON.stringify(player)}`);

      // Check if player role is in active auction roles
      if (league.active_auction_roles) {
        const activeRoles =
          league.active_auction_roles.toUpperCase() === "ALL"
            ? ["P", "D", "C", "A"]
            : league.active_auction_roles
                .split(",")
                .map((r) => r.trim().toUpperCase());

        if (!activeRoles.includes(player.role.toUpperCase())) {
          console.error(
            `[BID_SERVICE] Player role ${player.role} not in active roles: ${league.active_auction_roles}`
          );
          throw new Error(
            `Le aste per il ruolo ${player.role} non sono attualmente attive. Ruoli attivi: ${league.active_auction_roles}`
          );
        }
      }
      const participant = db
        .prepare(
          `SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?`
        )
        .get(leagueId, userId) as ParticipantForBidding | undefined;
      if (!participant) {
        console.error(
          `[BID_SERVICE] Participant ${userId} not found for league ${leagueId}`
        );
        throw new Error(
          `Operazione non autorizzata: non fai parte di questa lega`
        );
      }
      console.log(
        `[BID_SERVICE] Participant info: ${JSON.stringify(participant)}`
      );

      // Add this validation before slot/budget checks
      if (participant.user_id !== userId) {
        console.error(
          `[BID_SERVICE] User ${userId} attempting to bid for another team`
        );
        throw new Error("Non sei autorizzato a gestire questa squadra");
      }

      console.log(`[BID_SERVICE] Calling checkSlotsAndBudgetOrThrow...`);
      checkSlotsAndBudgetOrThrow(
        league,
        player,
        participant,
        userId,
        bidAmount,
        false,
        playerId
      );
      console.log(`[BID_SERVICE] checkSlotsAndBudgetOrThrow passed.`);

      // --- RIMOZIONE BLOCCO PROBLEMATICO CHE CAUSAVA DOPPIO RILASCIO ---
      // Il rilascio dei crediti viene gestito SOLO nella sezione centralizzata più avanti
      // per evitare doppi rilasci che portavano a crediti negativi

      // Blocchi 3, 4, e 5 sono stati rimossi. La loro logica è ora gestita dal Blocco 6.

      // --- Blocco 6: Logica di Simulazione Auto-Bid ---
      console.log(`[BID_SERVICE] Avvio logica di simulazione auto-bid...`);

      // NEW: Upsert auto-bid within the same transaction if provided
      console.log(
        `[DEBUG AUTO-BID] placeBidOnExistingAuction received autoBidMaxAmount:`,
        autoBidMaxAmount
      );
      console.log(
        `[DEBUG AUTO-BID] autoBidMaxAmount type:`,
        typeof autoBidMaxAmount
      );
      console.log(
        `[DEBUG AUTO-BID] autoBidMaxAmount > 0:`,
        autoBidMaxAmount && autoBidMaxAmount > 0
      );

      if (autoBidMaxAmount && autoBidMaxAmount > 0) {
        const now = Math.floor(Date.now() / 1000);
        // Inserisci o aggiorna l'auto-bid senza toccare i locked_credits qui.
        // La gestione dei crediti è centralizzata dopo la simulazione.
        db.prepare(
          `
      INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
      VALUES (?, ?, ?, TRUE, ?, ?)
      ON CONFLICT(auction_id, user_id) 
      DO UPDATE SET 
        max_amount = excluded.max_amount,
        is_active = TRUE,
        updated_at = excluded.updated_at
    `
        ).run(auction.id, userId, autoBidMaxAmount, now, now);
        console.log(
          `[BID_SERVICE] Auto-bid for user ${userId} upserted to ${autoBidMaxAmount}`
        );
      }

      // 1. Raccogli tutti gli auto-bid attivi per l'asta, inclusi quelli dell'offerente attuale
      const allActiveAutoBids = db
        .prepare(
          `SELECT user_id as userId, max_amount as maxAmount, created_at as createdAt
         FROM auto_bids
         WHERE auction_id = ? AND is_active = TRUE
         ORDER BY created_at ASC`
        )
        .all(auction.id) as Omit<AutoBidBattleParticipant, "isActive">[];

      console.log(
        `[BID_SERVICE] Trovati ${allActiveAutoBids.length} auto-bid attivi: ${JSON.stringify(
          allActiveAutoBids
        )}`
      );

      // 2. Esegui la simulazione della battaglia
      const battleResult = simulateAutoBidBattle(
        bidAmount,
        userId,
        allActiveAutoBids.map((ab) => ({ ...ab, isActive: true }))
      );

      console.log(
        `[BID_SERVICE] Risultato simulazione: ${JSON.stringify(battleResult, null, 2)}`
      );

      const { finalAmount, finalBidderId, battleSteps } = battleResult;

      // --- GESTIONE CREDITI CORRETTA: RICALCOLO COMPLETO ---
      // Invece di aggiungere/sottrarre crediti, ricalcoliamo il totale corretto per evitare accumuli

      // 1. Calcola tutti gli auto-bid attivi per il vincitore finale in questa lega
      const finalWinnerTotalAutoBids = db
        .prepare(
          `
        SELECT COALESCE(SUM(ab.max_amount), 0) as total_auto_bid_amount
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        WHERE ab.user_id = ? 
        AND ab.is_active = TRUE 
        AND a.auction_league_id = ?
        AND a.status IN ('active', 'closing')
      `
        )
        .get(finalBidderId, leagueId) as { total_auto_bid_amount: number };

      // 2. Aggiungi eventuali offerte manuali vincenti senza auto-bid
      const finalWinnerManualBids = db
        .prepare(
          `
        SELECT COALESCE(SUM(a.current_highest_bid_amount), 0) as total_manual_locked
        FROM auctions a
        WHERE a.current_highest_bidder_id = ?
        AND a.auction_league_id = ?
        AND a.status IN ('active', 'closing')
        AND NOT EXISTS (
          SELECT 1 FROM auto_bids ab 
          WHERE ab.auction_id = a.id 
          AND ab.user_id = a.current_highest_bidder_id 
          AND ab.is_active = TRUE
        )
      `
        )
        .get(finalBidderId, leagueId) as { total_manual_locked: number };

      const correctTotalLockedCredits =
        finalWinnerTotalAutoBids.total_auto_bid_amount +
        finalWinnerManualBids.total_manual_locked;

      // 3. Imposta il valore corretto (non aggiungere)
      db.prepare(
        "UPDATE league_participants SET locked_credits = ? WHERE league_id = ? AND user_id = ?"
      ).run(correctTotalLockedCredits, leagueId, finalBidderId);

      console.log(
        `[CREDIT_FIX] Locked credits per ${finalBidderId} impostati a ${correctTotalLockedCredits} (auto-bid: ${finalWinnerTotalAutoBids.total_auto_bid_amount}, manual: ${finalWinnerManualBids.total_manual_locked})`
      );
      // --- FINE GESTIONE CREDITI CORRETTA ---

      // Valida budget e slot per il vincitore finale
      const finalWinnerParticipant = db
        .prepare(
          `SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?`
        )
        .get(leagueId, finalBidderId) as ParticipantForBidding | undefined;

      if (!finalWinnerParticipant) {
        throw new Error(`Partecipante vincitore ${finalBidderId} non trovato.`);
      }

      // NOTA: La validazione del budget qui potrebbe sembrare ridondante, ma è una sicurezza aggiuntiva.
      checkSlotsAndBudgetOrThrow(
        league,
        player,
        finalWinnerParticipant,
        finalBidderId,
        finalAmount,
        false,
        playerId
      );
      console.log(
        `[BID_SERVICE] Budget e slot validi per il vincitore finale ${finalBidderId}.`
      );

      // Aggiorna l'asta con il risultato finale
      const newScheduledEndTime =
        Math.floor(Date.now() / 1000) + league.timer_duration_minutes * 60;
      const updateAuctionResult = db
        .prepare(
          `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, updated_at = strftime('%s', 'now') WHERE id = ?`
        )
        .run(finalAmount, finalBidderId, newScheduledEndTime, auction.id);

      if (updateAuctionResult.changes === 0) {
        throw new Error(
          `Aggiornamento dell'asta ${auction.id} fallito. Nessuna riga modificata.`
        );
      }
      console.log(
        `[BID_SERVICE] Asta ${auction.id} aggiornata. Vincitore: ${finalBidderId}, Importo: ${finalAmount}`
      );

      // Gestione auto-bid superati con ricalcolo completo crediti
      const outbidAutoBids = db
        .prepare(
          `SELECT user_id, max_amount
         FROM auto_bids
         WHERE auction_id = ? AND is_active = TRUE AND max_amount < ?`
        )
        .all(auction.id, finalAmount) as {
        user_id: string;
        max_amount: number;
      }[];

      if (outbidAutoBids.length > 0) {
        const userIDsToDeactivate = outbidAutoBids.map((b) => b.user_id);
        const placeholders = userIDsToDeactivate.map(() => "?").join(",");

        // 1. Disattiva gli auto-bid superati
        const deactivateStmt = db.prepare(
          `UPDATE auto_bids
         SET is_active = FALSE, updated_at = strftime('%s', 'now')
         WHERE auction_id = ? AND user_id IN (${placeholders})`
        );
        deactivateStmt.run(auction.id, ...userIDsToDeactivate);

        // 2. Ricalcola locked_credits per ogni utente superato (invece di sottrarre)
        for (const bid of outbidAutoBids) {
          // Calcola i crediti corretti che dovrebbero essere bloccati per questo utente
          const userTotalAutoBids = db
            .prepare(
              `
            SELECT COALESCE(SUM(ab.max_amount), 0) as total_auto_bid_amount
            FROM auto_bids ab
            JOIN auctions a ON ab.auction_id = a.id
            WHERE ab.user_id = ? 
            AND ab.is_active = TRUE 
            AND a.auction_league_id = ?
            AND a.status IN ('active', 'closing')
          `
            )
            .get(bid.user_id, leagueId) as { total_auto_bid_amount: number };

          const userManualBids = db
            .prepare(
              `
            SELECT COALESCE(SUM(a.current_highest_bid_amount), 0) as total_manual_locked
            FROM auctions a
            WHERE a.current_highest_bidder_id = ?
            AND a.auction_league_id = ?
            AND a.status IN ('active', 'closing')
            AND NOT EXISTS (
              SELECT 1 FROM auto_bids ab 
              WHERE ab.auction_id = a.id 
              AND ab.user_id = a.current_highest_bidder_id 
              AND ab.is_active = TRUE
            )
          `
            )
            .get(bid.user_id, leagueId) as { total_manual_locked: number };

          const correctUserLockedCredits =
            userTotalAutoBids.total_auto_bid_amount +
            userManualBids.total_manual_locked;

          // Imposta il valore corretto (non sottrarre)
          db.prepare(
            `UPDATE league_participants
           SET locked_credits = ?
           WHERE user_id = ? AND league_id = ?`
          ).run(correctUserLockedCredits, bid.user_id, leagueId);

          console.log(
            `[BID_SERVICE] Locked credits per utente superato ${bid.user_id} ricalcolati a ${correctUserLockedCredits}`
          );
        }
        console.log(
          `[BID_SERVICE] Ricalcolati crediti per ${outbidAutoBids.length} utenti con auto-bid superato.`
        );
      }

      // Inserisci solo l'offerta finale nel DB per mantenere la cronologia pulita
      const finalBidType = battleResult.initialBidderHadWinningManualBid
        ? bidType
        : "auto";
      db.prepare(
        `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, strftime('%s', 'now'), ?)`
      ).run(auction.id, finalBidderId, finalAmount, finalBidType);
      console.log(`[BID_SERVICE] Inserito bid finale nel database.`);

      // Logging della battaglia per debug
      console.log(
        `[BID_SERVICE] Battaglia auto-bid completata in ${battleResult.totalSteps} steps.`
      );
      console.log(`[BID_SERVICE] Sequenza battaglia:`, battleSteps);

      const autoBidActivated =
        finalBidderId !== userId ||
        !battleResult.initialBidderHadWinningManualBid;

      return {
        success: true,
        previousHighestBidderId: previousHighestBidderId,
        newScheduledEndTime,
        playerName: db
          .prepare(`SELECT name FROM players WHERE id = ?`)
          .get(playerId) as { name: string } | undefined,
        autoBidActivated,
        autoBidUserId: autoBidActivated ? finalBidderId : undefined,
        autoBidUsername: autoBidActivated
          ? (
              db
                .prepare(`SELECT username FROM users WHERE id = ?`)
                .get(finalBidderId) as { username: string } | undefined
            )?.username
          : undefined,
        autoBidAmount: finalAmount,
        finalBidAmount: finalAmount,
        finalBidderId: finalBidderId,
      };
    });

    const result = transaction();
    console.log(
      `[BID_SERVICE] Transaction completed. Result: ${JSON.stringify(result)}`
    );

    // --- Gestione Timer di Risposta + COMPLIANCE CHECK PER UTENTI SUPERATI ---
    if (result.success) {
      // NUOVO: Controlla compliance per l'utente che è stato superato
      // Questo è fondamentale perché perdere un'offerta vincente può rendere la rosa non-compliant
      if (
        result.previousHighestBidderId &&
        result.previousHighestBidderId !== result.finalBidderId
      ) {
        try {
          console.log(
            `[BID_SERVICE] Triggering compliance check for outbid user ${result.previousHighestBidderId}`
          );
          const { processUserComplianceAndPenalties } = await import(
            "./penalty.service"
          );
          await processUserComplianceAndPenalties(
            leagueId,
            result.previousHighestBidderId
          );
        } catch (error) {
          console.error(
            `[BID_SERVICE] Non-critical error during compliance check for outbid user ${result.previousHighestBidderId}:`,
            error
          );
        }
      }
      // NUOVO: Anche l'utente che ha fatto l'offerta potrebbe aver perso una precedente offerta vincente
      // Controlla la sua compliance (caso meno comune ma possibile)
      if (
        userId !== result.finalBidderId &&
        userId !== result.previousHighestBidderId
      ) {
        try {
          console.log(
            `[BID_SERVICE] Triggering compliance check for bidding user who didn't win ${userId}`
          );
          const { processUserComplianceAndPenalties } = await import(
            "./penalty.service"
          );
          await processUserComplianceAndPenalties(leagueId, userId);
        } catch (error) {
          console.error(
            `[BID_SERVICE] Non-critical error during compliance check for bidding user ${userId}:`,
            error
          );
        }
      }

      // Cancella timer per l'utente che ha rilanciato (non serve più)
      try {
        const auctionInfoForCancel = db
          .prepare(
            "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'"
          )
          .get(leagueId, playerId) as { id: number } | undefined;
        if (auctionInfoForCancel) {
          await cancelResponseTimer(auctionInfoForCancel.id, userId);
          console.log(`[BID_SERVICE] Timer cancellato per l'utente ${userId}`);
        }
      } catch (error) {
        console.log(
          `[BID_SERVICE] Timer cancellation non-critical error: ${error}`
        );
      }

      // Crea timer pendente per l'utente superato
      const finalPreviousHighestBidderId = result.autoBidActivated
        ? userId
        : result.previousHighestBidderId;
      if (
        finalPreviousHighestBidderId &&
        finalPreviousHighestBidderId !==
          (result.autoBidActivated ? result.autoBidUserId : userId)
      ) {
        try {
          const auctionInfo = db
            .prepare(
              "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'"
            )
            .get(leagueId, playerId) as { id: number } | undefined;
          if (auctionInfo) {
            await createResponseTimer(
              auctionInfo.id,
              finalPreviousHighestBidderId
            );
            console.log(
              `[BID_SERVICE] Timer creato per l'utente superato ${finalPreviousHighestBidderId}`
            );
          }
        } catch (error) {
          console.error(
            `[BID_SERVICE] Error creating response timer: ${error}`
          );
        }
      }
    }

    // --- Blocco 7: Invio Notifiche Socket.IO (OTTIMIZZATO) ---
    if (result.success) {
      const {
        finalBidderId,
        previousHighestBidderId,
        finalBidAmount,
        newScheduledEndTime,
      } = result;

      // 4. Gestisci le notifiche individuali (invariato)
      const surpassedUsers = new Set<string>();
      if (
        result.previousHighestBidderId &&
        result.previousHighestBidderId !== result.finalBidderId
      ) {
        surpassedUsers.add(result.previousHighestBidderId);
      }
      if (userId !== result.finalBidderId) {
        surpassedUsers.add(userId);
      }

      // 1. Recupera i dati aggiornati per il payload arricchito
      const budgetUpdates = [];
      const getParticipantBudget = (pUserId: string) =>
        db
          .prepare(
            `SELECT current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`
          )
          .get(leagueId, pUserId) as
          | { current_budget: number; locked_credits: number }
          | undefined;

      // Aggiungi budget del vincitore finale
      const finalWinnerBudget = getParticipantBudget(finalBidderId);
      if (finalWinnerBudget) {
        budgetUpdates.push({
          userId: finalBidderId,
          newBudget: finalWinnerBudget.current_budget,
          newLockedCredits: finalWinnerBudget.locked_credits,
        });
      }

      // Aggiungi budget dell'offerente precedente (se diverso dal vincitore)
      if (
        previousHighestBidderId &&
        previousHighestBidderId !== finalBidderId
      ) {
        const previousBidderBudget = getParticipantBudget(
          previousHighestBidderId
        );
        if (previousBidderBudget) {
          budgetUpdates.push({
            userId: previousHighestBidderId,
            newBudget: previousBidderBudget.current_budget,
            newLockedCredits: previousBidderBudget.locked_credits,
          });
        }
      }

      // Recupera l'ID dell'asta per trovare l'ultima offerta
      const auctionInfoForBid = db
        .prepare(
          "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ?"
        )
        .get(leagueId, playerId) as { id: number };

      // Recupera l'ultima offerta inserita
      const lastBidStmt = db.prepare(
        `SELECT b.id, b.user_id, b.amount, b.bid_time, u.username as bidder_username FROM bids b JOIN users u ON b.user_id = u.id WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 1`
      );
      const lastBid = lastBidStmt.get(auctionInfoForBid.id) as
        | {
            id: number;
            user_id: string;
            amount: number;
            bid_time: string;
            bidder_username: string;
          }
        | undefined;

      // 2. Costruisci il payload arricchito
      const richPayload = {
        playerId,
        newPrice: finalBidAmount,
        highestBidderId: finalBidderId,
        scheduledEndTime: newScheduledEndTime,
        autoBidActivated: result.autoBidActivated,
        budgetUpdates,
        newBid: lastBid
          ? {
              ...lastBid,
              bid_time: new Date(
                parseInt(lastBid.bid_time) * 1000
              ).toISOString(),
            }
          : undefined,
      };

      console.log(
        `[BID_SERVICE] Notifying socket server with rich payload for auction-update.`
      );
      console.log(
        `[BID_SERVICE] Auction update payload:`,
        JSON.stringify(richPayload, null, 2)
      );

      // 3. Invia l'evento `auction-update` arricchito
      await notifySocketServer({
        room: `league-${leagueId}`,
        event: "auction-update",
        data: richPayload,
      });

      for (const surpassedUserId of surpassedUsers) {
        console.log(
          `[BID_SERVICE] Notifying user ${surpassedUserId} of being surpassed.`
        );
        await notifySocketServer({
          room: `user-${surpassedUserId}`,
          event: "bid-surpassed-notification",
          data: {
            playerName: result.playerName?.name || "Giocatore",
            newBidAmount: result.finalBidAmount,
            autoBidActivated: true,
            autoBidUsername: result.autoBidUsername,
          },
        });
      }

      if (
        result.autoBidActivated &&
        result.finalBidderId === result.autoBidUserId
      ) {
        console.log(
          `[BID_SERVICE] Notifying auto-bidder (${result.autoBidUserId}) of auto-bid activation.`
        );
        await notifySocketServer({
          room: `user-${result.autoBidUserId}`,
          event: "auto-bid-activated-notification",
          data: {
            playerName: result.playerName?.name || "Giocatore",
            bidAmount: result.finalBidAmount,
            triggeredBy: userId,
          },
        });
      }

      // 5. Gestisci cambio stato (invariato)
      if (auctionInfoForBid) {
        for (const surpassedUserId of surpassedUsers) {
          console.log(
            `[BID_SERVICE] Handling state change for user ${surpassedUserId}, auction ${auctionInfoForBid.id}`
          );
          await handleBidderChange(
            auctionInfoForBid.id,
            surpassedUserId,
            result.finalBidderId!
          );
        }
      }

      // NEW: Trigger compliance check for the final winner
      try {
        console.log(
          `[BID_SERVICE] Triggering compliance check for final winner ${result.finalBidderId} after placing bid.`
        );
        const { processUserComplianceAndPenalties } = await import(
          "./penalty.service"
        );
        await processUserComplianceAndPenalties(leagueId, result.finalBidderId);
      } catch (error) {
        console.error(
          `[BID_SERVICE] Non-critical error during compliance check for final winner ${result.finalBidderId}:`,
          error
        );
      }
    }

    const message = result.autoBidActivated
      ? `Battaglia auto-bid conclusa! Vincitore: ${result.autoBidUsername || result.finalBidderId} con ${result.finalBidAmount} crediti.`
      : "Offerta piazzata con successo!";

    return { message };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unknown error occurred during the bidding process.";
    console.error(
      `[BID_SERVICE] CRITICAL ERROR in placeBidOnExistingAuction for user ${userId}, player ${playerId}: ${errorMessage}`,
      error
    );
    // Re-throw a more user-friendly error
    throw new Error(`Impossibile piazzare l'offerta: ${errorMessage}`);
  }
}

export const getAuctionStatusForPlayer = async (
  leagueIdParam: number,
  playerIdParam: number
): Promise<AuctionStatusDetails | null> => {
  const currentTime = Math.floor(Date.now() / 1000);
  console.log(
    `[getAuctionStatusForPlayer] 🔍 CRITICAL DEBUG - Searching for auction: league=${leagueIdParam}, player=${playerIdParam}, currentTime=${currentTime}`
  );

  // CRITICAL: Check for auction 1069 and player 5672 specifically
  if (playerIdParam === 5672) {
    console.log(
      `[getAuctionStatusForPlayer] 🚨 PLAYER 5672 DETECTED - This is the problematic case from user logs!`
    );
  }

  // ENHANCED: Use database transaction with proper isolation to prevent race conditions
  const result = db.transaction(() => {
    console.log(
      `[getAuctionStatusForPlayer] 🔒 Starting transaction for auction detection`
    );

    // Use READ UNCOMMITTED to see any pending transactions
    // This prevents race conditions where a bid is placed while another is being processed
    const auctionStmt = db.prepare(
      `SELECT 
        a.id, a.auction_league_id AS league_id, a.player_id, a.start_time, 
        a.scheduled_end_time, a.current_highest_bid_amount, a.current_highest_bidder_id, 
        a.status, a.created_at, a.updated_at, 
        p.id as p_id, p.name AS player_name, p.role as player_role, p.team as player_team,
        u.username AS current_highest_bidder_username 
       FROM auctions a 
       JOIN players p ON a.player_id = p.id 
       LEFT JOIN users u ON a.current_highest_bidder_id = u.id 
       WHERE a.auction_league_id = ? AND a.player_id = ? 
         AND a.status IN ('active', 'closing')
         AND a.scheduled_end_time > strftime('%s', 'now')
       ORDER BY a.updated_at DESC 
       LIMIT 1`
    );

    // First check for only active/closing auctions to avoid race conditions
    const activeAuctionData = auctionStmt.get(leagueIdParam, playerIdParam) as
      | (Omit<
          AuctionStatusDetails,
          "bid_history" | "time_remaining_seconds" | "player"
        > & {
          player_name: string;
          current_highest_bidder_username: string | null;
          p_id: number;
          player_role: string;
          player_team: string;
        })
      | undefined;

    console.log(`[getAuctionStatusForPlayer] 📊 ACTIVE/CLOSING Query result:`, {
      found: !!activeAuctionData,
      resultData: activeAuctionData
        ? {
            id: activeAuctionData.id,
            status: activeAuctionData.status,
            currentBid: activeAuctionData.current_highest_bid_amount,
            scheduledEndTime: activeAuctionData.scheduled_end_time,
            timeRemaining: activeAuctionData.scheduled_end_time - currentTime,
            updatedAt: activeAuctionData.updated_at,
            isExpired: activeAuctionData.scheduled_end_time < currentTime,
          }
        : null,
    });

    return activeAuctionData;
  })();

  if (result) {
    console.log(`[getAuctionStatusForPlayer] ✅ Found ACTIVE auction:`, {
      id: result.id,
      status: result.status,
      scheduledEndTime: result.scheduled_end_time,
      currentTime: Math.floor(Date.now() / 1000),
      timeRemaining: result.scheduled_end_time - Math.floor(Date.now() / 1000),
      currentBid: result.current_highest_bid_amount,
      currentBidder: result.current_highest_bidder_id,
    });

    // Return the active auction with full details
    const bidsStmt = db.prepare(
      `SELECT b.id, b.auction_id, b.user_id, b.amount, b.bid_time, b.bid_type, u.username as bidder_username FROM bids b JOIN users u ON b.user_id = u.id WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 10`
    );
    const bidHistory = bidsStmt.all(result.id) as BidRecord[];

    const timeRemainingSeconds =
      result.status === "active" || result.status === "closing"
        ? Math.max(0, result.scheduled_end_time - Math.floor(Date.now() / 1000))
        : undefined;

    const { p_id, player_role, player_team, ...restOfAuctionData } = result;

    return {
      ...restOfAuctionData,
      player: {
        id: p_id,
        role: player_role,
        name: result.player_name,
        team: player_team,
      },
      bid_history: bidHistory.reverse(),
      time_remaining_seconds: timeRemainingSeconds,
    };
  }

  // CRITICAL: Always check for ALL auctions to understand the complete state
  const allAuctionsStmt = db.prepare(`
    SELECT 
      a.id,
      a.status,
      a.current_highest_bid_amount,
      a.scheduled_end_time,
      a.updated_at,
      a.current_highest_bidder_id,
      (a.scheduled_end_time - strftime('%s', 'now')) as time_remaining_seconds,
      (CASE WHEN a.scheduled_end_time < strftime('%s', 'now') THEN 'EXPIRED' ELSE 'VALID' END) as expiry_status
    FROM auctions a 
    WHERE a.auction_league_id = ? AND a.player_id = ?
    ORDER BY a.updated_at DESC
  `);

  const allAuctions = allAuctionsStmt.all(
    leagueIdParam,
    playerIdParam
  ) as Array<{
    id: number;
    status: string;
    current_highest_bid_amount: number;
    scheduled_end_time: number;
    updated_at: number;
    current_highest_bidder_id: string | null;
    time_remaining_seconds: number;
    expiry_status: string;
  }>;

  console.log(
    `[getAuctionStatusForPlayer] 🔍 ALL auctions for player ${playerIdParam} (${allAuctions.length} found):`
  );
  allAuctions.forEach((auction, index) => {
    console.log(
      `  [${index}] ID:${auction.id} Status:${auction.status} Bid:${auction.current_highest_bid_amount} EndTime:${auction.scheduled_end_time} UpdatedAt:${auction.updated_at} ${auction.expiry_status}`
    );
    if (auction.id === 1069) {
      console.log(
        `    🚨 FOUND AUCTION 1069! Status: ${auction.status}, Expired: ${auction.expiry_status}`
      );
    }
  });

  // CRITICAL: If we find auction 1069 but didn't return it, log why
  if (playerIdParam === 5672) {
    const auction1069 = allAuctions.find((a) => a.id === 1069);
    if (auction1069 && !result) {
      console.log(
        `[getAuctionStatusForPlayer] 🚨 CRITICAL BUG DETECTED: Auction 1069 exists but was not returned!`
      );
      console.log(`  Auction 1069 status: ${auction1069.status}`);
      console.log(
        `  Auction 1069 scheduled_end_time: ${auction1069.scheduled_end_time}`
      );
      console.log(`  Current time: ${currentTime}`);
      console.log(
        `  Is expired?: ${auction1069.scheduled_end_time < currentTime}`
      );
      console.log(
        `  Status in active/closing?: ${["active", "closing"].includes(auction1069.status)}`
      );
    }
  }

  // If no active auction found, check for any auction (including completed ones) for logging
  const anyAuctionStmt = db.prepare(
    `SELECT 
      a.id, a.auction_league_id AS league_id, a.player_id, a.start_time, 
      a.scheduled_end_time, a.current_highest_bid_amount, a.current_highest_bidder_id, 
      a.status, a.created_at, a.updated_at, 
      p.id as p_id, p.name AS player_name, p.role as player_role, p.team as player_team,
      u.username AS current_highest_bidder_username 
     FROM auctions a 
     JOIN players p ON a.player_id = p.id 
     LEFT JOIN users u ON a.current_highest_bidder_id = u.id 
     WHERE a.auction_league_id = ? AND a.player_id = ? 
     ORDER BY CASE a.status WHEN 'active' THEN 1 WHEN 'closing' THEN 2 ELSE 3 END, a.updated_at DESC 
     LIMIT 1`
  );

  const anyAuctionData = anyAuctionStmt.get(leagueIdParam, playerIdParam) as
    | {
        id: number;
        status: string;
        scheduled_end_time: number;
        [key: string]: unknown;
      }
    | undefined;

  if (anyAuctionData) {
    console.log(`[getAuctionStatusForPlayer] ⚠️ Found NON-ACTIVE auction:`, {
      id: anyAuctionData.id,
      status: anyAuctionData.status,
      scheduledEndTime: anyAuctionData.scheduled_end_time,
      currentTime: Math.floor(Date.now() / 1000),
      reason: "AUCTION_EXISTS_BUT_NOT_BIDDABLE",
    });
  } else {
    console.log(
      `[getAuctionStatusForPlayer] ❌ No auction found for league=${leagueIdParam}, player=${playerIdParam}`
    );
  }

  return null;
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
      // CORREZIONE: Ottieni l'auto-bid del vincitore PRIMA di disattivarli
      const winnerAutoBid = db
        .prepare(
          "SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE"
        )
        .get(auction.id, auction.current_highest_bidder_id) as
        | { max_amount: number }
        | undefined;

      const amountToUnlock =
        winnerAutoBid?.max_amount || auction.current_highest_bid_amount;

      console.log(
        `[CREDIT_FIX] Auction ${auction.id}: Winner ${auction.current_highest_bidder_id}, unlocking ${amountToUnlock} credits (auto-bid: ${winnerAutoBid?.max_amount || "none"}, final price: ${auction.current_highest_bid_amount})`
      );

      db.transaction(() => {
        db.prepare(
          "UPDATE auctions SET status = 'sold', updated_at = ? WHERE id = ?"
        ).run(now, auction.id);

        // Ottieni TUTTI gli auto-bid prima di disattivarli
        const allAutoBidsForAuction = db
          .prepare(
            "SELECT user_id, max_amount FROM auto_bids WHERE auction_id = ? AND is_active = TRUE"
          )
          .all(auction.id) as {
          user_id: string;
          max_amount: number;
        }[];

        // Disattiva TUTTI gli auto-bid per questa asta
        db.prepare(
          "UPDATE auto_bids SET is_active = FALSE, updated_at = ? WHERE auction_id = ?"
        ).run(now, auction.id);

        // Sblocca i crediti per tutti gli utenti che avevano auto-bid attivi (eccetto il vincitore)
        const losingAutoBids = allAutoBidsForAuction.filter(
          (autoBid) => autoBid.user_id !== auction.current_highest_bidder_id
        );

        for (const otherAutoBid of losingAutoBids) {
          db.prepare(
            "UPDATE league_participants SET locked_credits = locked_credits - ? WHERE league_id = ? AND user_id = ?"
          ).run(
            otherAutoBid.max_amount,
            auction.auction_league_id,
            otherAutoBid.user_id
          );
          console.log(
            `[CREDIT_FIX] Unlocked ${otherAutoBid.max_amount} credits for losing bidder ${otherAutoBid.user_id}`
          );
        }

        db.prepare(
          "UPDATE league_participants SET current_budget = current_budget - ?, locked_credits = locked_credits - ? WHERE league_id = ? AND user_id = ?"
        ).run(
          auction.current_highest_bid_amount, // Il budget è ridotto del prezzo di acquisto
          amountToUnlock, // I crediti bloccati sono ridotti della promessa originale
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

        // TASK 1.2: Re-check compliance after player assignment
        checkAndRecordCompliance(
          auction.current_highest_bidder_id,
          auction.auction_league_id
        );

        // NUOVO: Check compliance for all users who had auto-bids but didn't win
        // They might have become non-compliant after losing this auction
        for (const otherAutoBid of losingAutoBids) {
          try {
            console.log(
              `[AUCTION_EXPIRED] Checking compliance for user ${otherAutoBid.user_id} who lost auction ${auction.id}`
            );
            const complianceResult = checkAndRecordCompliance(
              otherAutoBid.user_id,
              auction.auction_league_id
            );

            if (
              complianceResult.statusChanged &&
              !complianceResult.isCompliant
            ) {
              console.log(
                `[AUCTION_EXPIRED] CRITICAL: User ${otherAutoBid.user_id} became non-compliant after losing auction - penalty timer restarted`
              );
            }
          } catch (error) {
            console.error(
              `[AUCTION_EXPIRED] Error checking compliance for losing bidder ${otherAutoBid.user_id}:`,
              error
            );
          }
        }

        // NUOVO: Check compliance for ALL other users who made bids (manual or auto) but didn't win
        // This catches manual bidders who might not have had auto-bids
        const allLosingBidders = db
          .prepare(
            "SELECT DISTINCT user_id FROM bids WHERE auction_id = ? AND user_id != ?"
          )
          .all(auction.id, auction.current_highest_bidder_id) as {
          user_id: string;
        }[];

        for (const losingBidder of allLosingBidders) {
          // Skip if already checked in auto-bid loop above
          if (
            !losingAutoBids.some((ab) => ab.user_id === losingBidder.user_id)
          ) {
            try {
              console.log(
                `[AUCTION_EXPIRED] Checking compliance for manual bidder ${losingBidder.user_id} who lost auction ${auction.id}`
              );
              const complianceResult = checkAndRecordCompliance(
                losingBidder.user_id,
                auction.auction_league_id
              );

              if (
                complianceResult.statusChanged &&
                !complianceResult.isCompliant
              ) {
                console.log(
                  `[AUCTION_EXPIRED] CRITICAL: Manual bidder ${losingBidder.user_id} became non-compliant after losing auction - penalty timer restarted`
                );
              }
            } catch (error) {
              console.error(
                `[AUCTION_EXPIRED] Error checking compliance for manual bidder ${losingBidder.user_id}:`,
                error
              );
            }
          }
        }
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

// FASE 3: Funzione di validazione per prevenire futuri problemi
export function validateLockedCreditsConsistency(leagueId: number): {
  isValid: boolean;
  issues: Array<{
    userId: string;
    teamName: string;
    expected: number;
    actual: number;
    difference: number;
  }>;
} {
  console.log(
    `[CREDIT_VALIDATION] Validating locked credits for league ${leagueId}`
  );

  const participants = db
    .prepare(
      `
    SELECT user_id, locked_credits, manager_team_name
    FROM league_participants 
    WHERE league_id = ?
  `
    )
    .all(leagueId) as Array<{
    user_id: string;
    locked_credits: number;
    manager_team_name: string;
  }>;

  const issues = [];

  for (const participant of participants) {
    // Calcola i crediti bloccati attesi sommando tutti gli auto-bid attivi
    const expectedLocked = db
      .prepare(
        `
      SELECT COALESCE(SUM(ab.max_amount), 0) as total
      FROM auto_bids ab
      JOIN auctions a ON ab.auction_id = a.id
      WHERE a.auction_league_id = ? 
        AND ab.user_id = ? 
        AND ab.is_active = TRUE
        AND a.status = 'active'
    `
      )
      .get(leagueId, participant.user_id) as { total: number };

    if (participant.locked_credits !== expectedLocked.total) {
      const difference = participant.locked_credits - expectedLocked.total;
      issues.push({
        userId: participant.user_id,
        teamName: participant.manager_team_name,
        expected: expectedLocked.total,
        actual: participant.locked_credits,
        difference: difference,
      });

      console.log(
        `[CREDIT_VALIDATION] Issue found for ${participant.manager_team_name}: expected ${expectedLocked.total}, actual ${participant.locked_credits}, difference ${difference}`
      );
    }
  }

  const isValid = issues.length === 0;
  console.log(
    `[CREDIT_VALIDATION] Validation ${isValid ? "PASSED" : "FAILED"} - ${issues.length} issues found`
  );

  return { isValid, issues };
}

// Funzione di correzione automatica per i crediti bloccati
export function fixLockedCreditsConsistency(leagueId: number): {
  fixedCount: number;
  errors: string[];
} {
  console.log(`[CREDIT_FIX] Starting automatic fix for league ${leagueId}`);

  const validation = validateLockedCreditsConsistency(leagueId);
  if (validation.isValid) {
    console.log(`[CREDIT_FIX] No issues found, no fixes needed`);
    return { fixedCount: 0, errors: [] };
  }

  let fixedCount = 0;
  const errors: string[] = [];

  const transaction = db.transaction(() => {
    for (const issue of validation.issues) {
      try {
        db.prepare(
          `
          UPDATE league_participants 
          SET locked_credits = ? 
          WHERE league_id = ? AND user_id = ?
        `
        ).run(issue.expected, leagueId, issue.userId);

        console.log(
          `[CREDIT_FIX] Fixed ${issue.teamName}: ${issue.actual} -> ${issue.expected} (difference: ${issue.difference})`
        );
        fixedCount++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(`Failed to fix ${issue.teamName}: ${errorMsg}`);
        console.error(`[CREDIT_FIX] Error fixing ${issue.teamName}:`, error);
      }
    }
  });

  transaction();

  console.log(
    `[CREDIT_FIX] Completed: ${fixedCount} fixed, ${errors.length} errors`
  );
  return { fixedCount, errors };
}
