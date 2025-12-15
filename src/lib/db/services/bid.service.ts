// src/lib/db/services/bid.service.ts v.3.0 (Async Turso Migration)
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
interface AutoBidBattleParticipant {
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
function simulateAutoBidBattle(
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

  // CORREZIONE: Controlla se ci sono auto-bid che possono competere
  // NOTA: Non escludere l'auto-bid dell'offerente - può competere con altri auto-bid
  const competingAutoBids = autoBids.filter((ab) => ab.maxAmount > currentBid);

  if (competingAutoBids.length === 0) {
    // Nessun auto-bid può competere, l'offerta manuale vince
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

  // Trova l'auto-bid vincente (massimo importo, poi priorità temporale)
  const winningAutoBid = competingAutoBids.sort((a, b) => {
    // Prima ordina per max_amount (decrescente)
    if (b.maxAmount !== a.maxAmount) {
      return b.maxAmount - a.maxAmount;
    }
    // In caso di parità, ordina per createdAt (crescente = primo vince)
    return a.createdAt - b.createdAt;
  })[0];

  console.log(
    `[AUTO_BID] Auto-bid vincente: ${winningAutoBid.userId} con max ${winningAutoBid.maxAmount}`
  );

  // CORREZIONE: Calcola il prezzo finale secondo la logica eBay
  let finalAmount: number;

  // Trova il secondo miglior auto-bid (se esiste)
  const secondBestAutoBid = competingAutoBids
    .filter((ab) => ab.userId !== winningAutoBid.userId)
    .sort((a, b) => {
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      return a.createdAt - b.createdAt;
    })[0];

  if (secondBestAutoBid) {
    console.log(
      `[AUTO_BID] Secondo miglior auto-bid: ${secondBestAutoBid.userId} con max ${secondBestAutoBid.maxAmount}`
    );

    if (secondBestAutoBid.maxAmount === winningAutoBid.maxAmount) {
      // CASO PARITÀ: il vincitore (primo per timestamp) paga il suo importo massimo
      finalAmount = winningAutoBid.maxAmount;
      console.log(
        `[AUTO_BID] PARITÀ rilevata! Vincitore paga importo massimo: ${finalAmount}`
      );
    } else {
      // Il vincitore paga 1 credito più del secondo migliore, ma non più del suo massimo
      finalAmount = Math.min(
        secondBestAutoBid.maxAmount + 1,
        winningAutoBid.maxAmount
      );
      console.log(
        `[AUTO_BID] Vincitore paga 1+ del secondo migliore: ${finalAmount}`
      );
    }
  } else {
    // Solo un auto-bid: paga 1 credito più dell'offerta manuale, ma non più del suo massimo
    finalAmount = Math.min(currentBid + 1, winningAutoBid.maxAmount);
    console.log(
      `[AUTO_BID] Solo un auto-bid, paga 1+ dell'offerta manuale: ${finalAmount}`
    );
  }

  // Aggiungi il bid finale dell'auto-bid vincente
  battleSteps.push({
    bidAmount: finalAmount,
    bidderId: winningAutoBid.userId,
    isAutoBid: true,
    step: step++,
  });

  return {
    finalAmount: finalAmount,
    finalBidderId: winningAutoBid.userId,
    battleSteps,
    totalSteps: step,
    initialBidderHadWinningManualBid: false,
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
  photo_url?: string | null;
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

export interface AuctionStatus {
  id: number;
  player_id: number;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
  status: string;
  min_bid?: number;
  time_remaining?: number;
  player_value?: number;
}

/**
 * Retrieves the current active auction for a league.
 */
export const getCurrentActiveAuction = async (
  leagueId: number
): Promise<AuctionStatusDetails | null> => {
  try {
    // Get current active auction
    const activeAuctionResult = await db.execute({
      sql: `SELECT
          a.id,
          a.player_id,
          a.current_highest_bid_amount,
          a.current_highest_bidder_id,
          a.scheduled_end_time,
          a.status,
          p.name as player_name,
          p.role as player_role,
          p.photo_url as player_image
         FROM auctions a
         JOIN players p ON a.player_id = p.id
         WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing')
         ORDER BY a.created_at DESC
         LIMIT 1`,
      args: [leagueId],
    });
    const activeAuction = activeAuctionResult.rows[0] as unknown as
      | {
        id: number;
        player_id: number;
        current_highest_bid_amount: number;
        current_highest_bidder_id: string | null;
        scheduled_end_time: number;
        status: string;
        player_name: string;
        player_role: string;
        player_image: string | null;
      }
      | undefined;

    if (!activeAuction) {
      return null;
    }

    // Get detailed auction status using existing service
    return await getAuctionStatusForPlayer(
      leagueId,
      activeAuction.player_id
    );
  } catch (error) {
    console.error("Error fetching current auction:", error);
    throw new Error("Errore nel recupero dell'asta corrente");
  }
};

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

// 3. Funzione Helper Interna per Controllo Slot e Budget (ASYNC)
// MODIFICA v3.1: Aggiunta validazione che riserva 1 credito per ogni slot vuoto rimanente
// MODIFICA v3.2: Aggiunto parametro txClient per garantire isolamento transazionale
const checkSlotsAndBudgetOrThrow = async (
  txClient: { execute: typeof db.execute }, // Accetta sia db che una transazione
  league: LeagueForBidding,
  player: PlayerForBidding,
  participant: ParticipantForBidding,
  bidderUserIdForCheck: string,
  bidAmountForCheck: number,
  isNewAuctionAttempt: boolean,
  currentAuctionTargetPlayerId?: number
) => {
  // 1. Calcola slot massimi totali dalla configurazione della lega
  const totalMaxSlots = league.slots_P + league.slots_D + league.slots_C + league.slots_A;

  // 2. Calcola giocatori già acquisiti (dai campi del participant)
  const totalAcquired =
    (participant.players_P_acquired || 0) +
    (participant.players_D_acquired || 0) +
    (participant.players_C_acquired || 0) +
    (participant.players_A_acquired || 0);

  // 3. Calcola offerte vincenti attive (aste dove l'utente è miglior offerente) - esclude l'asta corrente se è un rilancio
  let activeWinningBidsSql = `
    SELECT COUNT(*) as count FROM auctions
    WHERE auction_league_id = ? AND current_highest_bidder_id = ?
    AND status IN ('active', 'closing')
  `;
  const activeWinningBidsArgs: (string | number)[] = [league.id, bidderUserIdForCheck];

  if (!isNewAuctionAttempt && currentAuctionTargetPlayerId !== undefined) {
    // Se è un rilancio su asta esistente, non contarla due volte
    activeWinningBidsSql += ` AND player_id != ?`;
    activeWinningBidsArgs.push(currentAuctionTargetPlayerId);
  }

  // Usa txClient invece di db per isolamento transazionale
  const activeWinningBidsResult = await txClient.execute({
    sql: activeWinningBidsSql,
    args: activeWinningBidsArgs,
  });
  const activeWinningBids = Number(activeWinningBidsResult.rows[0].count);

  // 4. Slot virtuali occupati (già acquisiti + offerte vincenti)
  const slotsOccupied = totalAcquired + activeWinningBids;

  // 5. Slot rimanenti da riempire DOPO questa offerta
  // Se è una nuova asta, questa offerta riempirà uno slot aggiuntivo
  const slotsRemainingAfterBid = isNewAuctionAttempt
    ? totalMaxSlots - slotsOccupied - 1  // -1 perché questa offerta occuperà uno slot
    : totalMaxSlots - slotsOccupied;      // Rilancio su asta esistente: slot già contato

  // 6. Crediti da riservare per slot vuoti futuri (1 credito per slot)
  // Ogni slot vuoto deve avere 1 credito riservato per poter essere riempito
  const creditsToReserve = Math.max(0, slotsRemainingAfterBid);

  // 7. Calcola budget disponibile per questa offerta (sottraendo crediti riservati)
  const baseBudget = participant.current_budget - participant.locked_credits;
  const availableBudget = baseBudget - creditsToReserve;

  console.log(
    `[BUDGET_CHECK] User ${bidderUserIdForCheck}: budget=${participant.current_budget}, ` +
    `locked=${participant.locked_credits}, slotsOccupied=${slotsOccupied}, ` +
    `slotsRemaining=${slotsRemainingAfterBid}, reserve=${creditsToReserve}, ` +
    `available=${availableBudget}, bid=${bidAmountForCheck}`
  );

  if (availableBudget < bidAmountForCheck) {
    throw new Error(
      `Budget insufficiente. Disponibile: ${availableBudget} crediti ` +
      `(${participant.current_budget} totale - ${participant.locked_credits} bloccati ` +
      `- ${creditsToReserve} riservati per ${slotsRemainingAfterBid} slot vuoti). ` +
      `Offerta: ${bidAmountForCheck} crediti.`
    );
  }

  // --- Controllo Slot per Ruolo (logica originale) ---
  // Usa txClient invece di db per isolamento transazionale
  const countAssignedPlayerForRoleResult = await txClient.execute({
    sql: `SELECT COUNT(*) as count FROM player_assignments pa JOIN players p ON pa.player_id = p.id WHERE pa.auction_league_id = ? AND pa.user_id = ? AND p.role = ?`,
    args: [league.id, bidderUserIdForCheck, player.role],
  });
  const currentlyAssignedForRole = Number(
    countAssignedPlayerForRoleResult.rows[0].count
  );

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
  // Usa txClient invece di db per isolamento transazionale
  const activeBidsResult = await txClient.execute({
    sql: activeBidsAsWinnerSql,
    args: activeBidsQueryParams,
  });
  const activeWinningBidsForRoleOnOtherPlayers = Number(
    activeBidsResult.rows[0].count
  );

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


export const placeInitialBidAndCreateAuction = async (
  leagueIdParam: number,
  playerIdParam: number,
  bidderUserIdParam: string,
  bidAmountParam: number,
  autoBidMaxAmount?: number | null
): Promise<AuctionCreationResult> => {
  // Check if user is in cooldown for this player (48h after abandoning) - BEFORE transaction
  const cooldownInfo = await getUserCooldownInfo(
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

  const tx = await db.transaction("write");

  try {
    const now = Math.floor(Date.now() / 1000);
    const leagueResult = await tx.execute({
      sql: "SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A, config_json FROM auction_leagues WHERE id = ?",
      args: [leagueIdParam],
    });
    const league = leagueResult.rows[0] as unknown as
      | (LeagueForBidding & { config_json: string })
      | undefined;

    if (!league) throw new Error(`Lega con ID ${leagueIdParam} non trovata.`);
    if (league.status !== "draft_active" && league.status !== "repair_active")
      throw new Error(
        `Le offerte non sono attive per la lega (status: ${league.status}).`
      );

    const playerResult = await tx.execute({
      sql: "SELECT id, role, name, current_quotation FROM players WHERE id = ?",
      args: [playerIdParam],
    });
    const player = playerResult.rows[0] as unknown as
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

    const participantResult = await tx.execute({
      sql: "SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdParam, bidderUserIdParam],
    });
    const participant = participantResult.rows[0] as unknown as
      | ParticipantForBidding
      | undefined;
    if (!participant)
      throw new Error(
        `Utente ${bidderUserIdParam} non partecipa alla lega ${leagueIdParam}.`
      );

    const assignmentResult = await tx.execute({
      sql: "SELECT player_id FROM player_assignments WHERE auction_league_id = ? AND player_id = ?",
      args: [leagueIdParam, playerIdParam],
    });
    if (assignmentResult.rows.length > 0)
      throw new Error(
        `Giocatore ${playerIdParam} già assegnato in questa lega.`
      );

    const existingAuctionResult = await tx.execute({
      sql: "SELECT id, scheduled_end_time, status FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status IN ('active', 'closing')",
      args: [leagueIdParam, playerIdParam],
    });
    const existingAuction = existingAuctionResult.rows[0] as unknown as
      | { id: number; scheduled_end_time: number; status: string }
      | undefined;

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

    // v3.2: Ora checkSlotsAndBudgetOrThrow usa txClient per isolamento transazionale
    await checkSlotsAndBudgetOrThrow(
      tx,
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

    const lockResult = await tx.execute({
      sql: "UPDATE league_participants SET locked_credits = locked_credits + ?, updated_at = ? WHERE league_id = ? AND user_id = ?",
      args: [amountToLock, now, leagueIdParam, bidderUserIdParam],
    });
    if (lockResult.rowsAffected === 0)
      throw new Error(
        `Impossibile bloccare i crediti per l'utente ${bidderUserIdParam}.`
      );

    const auctionDurationSeconds = league.timer_duration_minutes * 60;
    const scheduledEndTime = now + auctionDurationSeconds;

    let newAuctionId: number;
    try {
      const createAuctionResult = await tx.execute({
        sql: `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?) RETURNING id`,
        args: [
          leagueIdParam,
          playerIdParam,
          now,
          scheduledEndTime,
          bidAmountParam,
          bidderUserIdParam,
          now,
          now,
        ],
      });
      newAuctionId = Number(createAuctionResult.rows[0].id);
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

    if (!newAuctionId) throw new Error("Creazione asta fallita.");

    // NEW: Upsert auto-bid within the same transaction if provided
    if (autoBidMaxAmount && autoBidMaxAmount > 0) {
      await tx.execute({
        sql: `INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
           VALUES (?, ?, ?, TRUE, ?, ?)
           ON CONFLICT(auction_id, user_id)
           DO UPDATE SET
             max_amount = excluded.max_amount,
             is_active = TRUE,
             updated_at = excluded.updated_at`,
        args: [
          newAuctionId,
          bidderUserIdParam,
          autoBidMaxAmount,
          now,
          now,
        ],
      });
      console.log(
        `[BID_SERVICE] Auto-bid for user upserted for new auction`
      );
    }

    const createBidResult = await tx.execute({
      sql: `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, 'manual') RETURNING id`,
      args: [newAuctionId, bidderUserIdParam, bidAmountParam, now],
    });
    const newBidId = Number(createBidResult.rows[0].id);

    if (!newBidId) throw new Error("Registrazione offerta fallita.");

    await tx.commit();

    // **NUOVO**: Notifica Socket.IO dopo che la transazione ha avuto successo
    // Get player information for the new auction
    const playerInfoResult = await db.execute({
      sql: "SELECT name, role, team FROM players WHERE id = ?",
      args: [playerIdParam],
    });
    const playerInfo = playerInfoResult.rows[0] as unknown as
      | { name: string; role: string; team: string }
      | undefined;

    console.log(
      "[BID_SERVICE] createAndStartAuction - Emitting auction-created event"
    );

    try {
      await notifySocketServer({
        room: `league-${leagueIdParam}`,
        event: "auction-created",
        data: {
          playerId: playerIdParam,
          auctionId: newAuctionId,
          newPrice: bidAmountParam,
          highestBidderId: bidderUserIdParam,
          scheduledEndTime: scheduledEndTime,
          playerName: playerInfo?.name || `Player ${playerIdParam}`,
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
  } catch (error) {
    await tx.rollback();
    throw error;
  }
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
  const cooldownInfo = await getUserCooldownInfo(userId, playerId, leagueId);
  if (!cooldownInfo.canBid) {
    console.error(
      `[BID_SERVICE] User ${userId} in cooldown for player ${playerId}: ${cooldownInfo.message}`
    );
    throw new Error(
      cooldownInfo.message ||
      "Non puoi fare offerte per questo giocatore. Hai un cooldown attivo."
    );
  }

  const tx = await db.transaction("write");
  let result;

  try {
    console.log(`[BID_SERVICE] Transaction started.`);
    // --- Blocco 1: Recupero Dati e Validazione Iniziale ---
    const auctionResult = await tx.execute({
      sql: `SELECT id, current_highest_bid_amount, current_highest_bidder_id, scheduled_end_time, user_auction_states FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'`,
      args: [leagueId, playerId],
    });
    const auction = auctionResult.rows[0] as unknown as
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

    const leagueResult = await tx.execute({
      sql: `SELECT id, status, active_auction_roles, min_bid, timer_duration_minutes, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?`,
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as
      | LeagueForBidding
      | undefined;
    if (!league) {
      console.error(`[BID_SERVICE] League not found: ${leagueId}`);
      throw new Error("Lega non trovata.");
    }

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
      const canCounterBidResult = await tx.execute({
        sql: `
        SELECT 1 FROM user_auction_response_timers
        WHERE auction_id = ? AND user_id = ? AND status = 'pending'
      `,
        args: [auction.id, userId],
      });
      const canCounterBid = canCounterBidResult.rows.length > 0;

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
    const playerResult = await tx.execute({
      sql: `SELECT id, role FROM players WHERE id = ?`,
      args: [playerId],
    });
    const player = playerResult.rows[0] as unknown as
      | PlayerForBidding
      | undefined;
    if (!player) {
      console.error(`[BID_SERVICE] Player not found: ${playerId}`);
      throw new Error(`Giocatore con ID ${playerId} non trovato.`);
    }

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
    const participantResult = await tx.execute({
      sql: `SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?`,
      args: [leagueId, userId],
    });
    const participant = participantResult.rows[0] as unknown as
      | ParticipantForBidding
      | undefined;
    if (!participant) {
      console.error(
        `[BID_SERVICE] Participant ${userId} not found for league ${leagueId}`
      );
      throw new Error(
        `Operazione non autorizzata: non fai parte di questa lega`
      );
    }

    // Add this validation before slot/budget checks
    if (participant.user_id !== userId) {
      console.error(
        `[BID_SERVICE] User ${userId} attempting to bid for another team`
      );
      throw new Error("Non sei autorizzato a gestire questa squadra");
    }

    console.log(`[BID_SERVICE] Calling checkSlotsAndBudgetOrThrow...`);
    await checkSlotsAndBudgetOrThrow(
      tx,
      league,
      player,
      participant,
      userId,
      bidAmount,
      false,
      playerId
    );
    console.log(`[BID_SERVICE] checkSlotsAndBudgetOrThrow passed.`);

    // --- Blocco 6: Logica di Simulazione Auto-Bid ---
    console.log(`[BID_SERVICE] Avvio logica di simulazione auto-bid...`);

    if (autoBidMaxAmount && autoBidMaxAmount > 0) {
      console.log(
        `[DEBUG AUTO-BID] About to insert auto-bid for auction ${auction.id}, user ${userId}, amount ${autoBidMaxAmount}`
      );

      try {
        // 1. Ottieni il vecchio importo dell'auto-bid per calcolare la differenza nei crediti bloccati
        const oldAutoBidResult = await tx.execute({
          sql: "SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE",
          args: [auction.id, userId],
        });
        const oldAutoBid = oldAutoBidResult.rows[0] as unknown as
          | { max_amount: number }
          | undefined;

        const oldMaxAmount = oldAutoBid?.max_amount || 0;
        const creditChange = autoBidMaxAmount - oldMaxAmount;

        console.log(
          `[DEBUG AUTO-BID] Credit change calculation: old=${oldMaxAmount}, new=${autoBidMaxAmount}, change=${creditChange}`
        );

        // 2. Aggiorna i locked_credits se c'è una variazione
        if (creditChange !== 0) {
          // Verifica che l'utente abbia abbastanza budget per l'aumento
          const currentParticipantResult = await tx.execute({
            sql: "SELECT current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?",
            args: [leagueId, userId],
          });
          const currentParticipant = currentParticipantResult.rows[0] as unknown as
            | { current_budget: number; locked_credits: number }
            | undefined;

          if (currentParticipant) {
            const availableBudget =
              currentParticipant.current_budget -
              currentParticipant.locked_credits;
            if (creditChange > availableBudget) {
              throw new Error(
                `Budget insufficiente per bloccare i crediti. Disponibile: ${availableBudget}, Aumento richiesto: ${creditChange}`
              );
            }

            await tx.execute({
              sql: "UPDATE league_participants SET locked_credits = locked_credits + ? WHERE league_id = ? AND user_id = ?",
              args: [creditChange, leagueId, userId],
            });
            console.log(
              `[DEBUG AUTO-BID] Updated locked_credits by ${creditChange} for user ${userId}`
            );
          }
        }

        // 3. Inserisci/Aggiorna l'auto-bid
        await tx.execute({
          sql: `
          INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
          VALUES (?, ?, ?, TRUE, ?, ?)
          ON CONFLICT(auction_id, user_id)
          DO UPDATE SET
            max_amount = excluded.max_amount,
            is_active = TRUE,
            updated_at = excluded.updated_at
        `,
          args: [auction.id, userId, autoBidMaxAmount, now, now],
        });
        console.log(
          `[BID_SERVICE] Auto-bid for user ${userId} upserted to ${autoBidMaxAmount}`
        );
      } catch (error) {
        console.error(`[DEBUG AUTO-BID] Error inserting auto-bid:`, error);
        throw error;
      }
    }

    // 1. Raccogli tutti gli auto-bid attivi per l'asta
    const allActiveAutoBidsResult = await tx.execute({
      sql: `SELECT user_id as userId, max_amount as maxAmount, created_at as createdAt
         FROM auto_bids
         WHERE auction_id = ? AND is_active = TRUE
         ORDER BY created_at ASC`,
      args: [auction.id],
    });
    const allActiveAutoBids = allActiveAutoBidsResult.rows as unknown as Omit<
      AutoBidBattleParticipant,
      "isActive"
    >[];

    console.log(
      `[BID_SERVICE] Trovati ${allActiveAutoBids.length} auto-bid attivi`
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

    const { finalAmount, finalBidderId } = battleResult;

    // 3. Applica il risultato della battaglia al database

    // Valida budget e slot per il vincitore finale
    const finalWinnerParticipantResult = await tx.execute({
      sql: `SELECT user_id, current_budget, locked_credits, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?`,
      args: [leagueId, finalBidderId],
    });
    const finalWinnerParticipant = finalWinnerParticipantResult.rows[0] as unknown as
      | ParticipantForBidding
      | undefined;

    if (!finalWinnerParticipant) {
      throw new Error(`Partecipante vincitore ${finalBidderId} non trovato.`);
    }

    await checkSlotsAndBudgetOrThrow(
      tx,
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
    const updateAuctionResult = await tx.execute({
      sql: `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, updated_at = ? WHERE id = ?`,
      args: [
        finalAmount,
        finalBidderId,
        newScheduledEndTime,
        now,
        auction.id,
      ],
    });

    if (updateAuctionResult.rowsAffected === 0) {
      throw new Error(
        `Aggiornamento dell'asta ${auction.id} fallito. Nessuna riga modificata.`
      );
    }

    // Sblocco crediti per auto-bid superati
    const outbidAutoBidsResult = await tx.execute({
      sql: `SELECT user_id, max_amount
         FROM auto_bids
         WHERE auction_id = ? AND is_active = TRUE AND max_amount < ?`,
      args: [auction.id, finalAmount],
    });
    const outbidAutoBids = outbidAutoBidsResult.rows as unknown as {
      user_id: string;
      max_amount: number;
    }[];

    if (outbidAutoBids.length > 0) {
      const userIDsToDeactivate = outbidAutoBids.map((b) => b.user_id);
      // Costruisci la query dinamicamente per IN clause
      const placeholders = userIDsToDeactivate.map(() => "?").join(",");

      await tx.execute({
        sql: `UPDATE auto_bids
         SET is_active = FALSE, updated_at = ?
         WHERE auction_id = ? AND user_id IN (${placeholders})`,
        args: [now, auction.id, ...userIDsToDeactivate],
      });

      // FIX: Invece di sottrarre incrementalmente (che può causare valori negativi),
      // ricalcoliamo i locked_credits dalla somma degli auto-bid attivi
      // PLUS le offerte manuali vincenti dove l'utente è miglior offerente senza auto-bid
      for (const bid of outbidAutoBids) {
        // Ricalcola locked_credits come:
        // 1. Somma auto-bid attivi per aste attive
        // 2. PIÙ offerte manuali vincenti (senza auto-bid) per aste attive
        const userLockedCreditsResult = await tx.execute({
          sql: `
            SELECT
              COALESCE(
                (SELECT SUM(ab.max_amount)
                 FROM auto_bids ab
                 JOIN auctions a ON ab.auction_id = a.id
                 WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
                0
              ) +
              COALESCE(
                (SELECT SUM(a.current_highest_bid_amount)
                 FROM auctions a
                 LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
                 WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
                   AND ab.id IS NULL
                   AND a.status IN ('active', 'closing')),
                0
              ) as total_locked
          `,
          args: [leagueId, bid.user_id, bid.user_id, leagueId, bid.user_id],
        });
        const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;

        await tx.execute({
          sql: `UPDATE league_participants
           SET locked_credits = ?
           WHERE user_id = ? AND league_id = ?`,
          args: [totalLocked, bid.user_id, leagueId],
        });
      }
      console.log(
        `[BID_SERVICE] Ricalcolati locked_credits per ${outbidAutoBids.length} utenti con auto-bid superato.`
      );
    }

    // Inserisci solo l'offerta finale nel DB per mantenere la cronologia pulita
    const finalBidType = battleResult.initialBidderHadWinningManualBid
      ? bidType
      : "auto";
    await tx.execute({
      sql: `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, ?)`,
      args: [auction.id, finalBidderId, finalAmount, now, finalBidType],
    });

    const autoBidActivated =
      finalBidderId !== userId ||
      !battleResult.initialBidderHadWinningManualBid;

    // Recupera info aggiuntive per il return
    const playerNameResult = await tx.execute({
      sql: "SELECT name FROM players WHERE id = ?",
      args: [playerId],
    });
    const playerName = (playerNameResult.rows[0] as unknown as { name: string })?.name;

    let autoBidUsername;
    if (autoBidActivated) {
      const uResult = await tx.execute({
        sql: "SELECT username FROM users WHERE id = ?",
        args: [finalBidderId],
      });
      autoBidUsername = (uResult.rows[0] as unknown as { username: string })?.username;
    }

    result = {
      success: true,
      previousHighestBidderId: previousHighestBidderId,
      newScheduledEndTime,
      playerName: { name: playerName },
      autoBidActivated,
      autoBidUserId: autoBidActivated ? finalBidderId : undefined,
      autoBidUsername,
      autoBidAmount: finalAmount,
      finalBidAmount: finalAmount,
      finalBidderId: finalBidderId,
    };

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  // --- Gestione Compliance e Timer (FUORI DALLA TRANSAZIONE) ---
  if (result.success) {
    const usersToCheck = new Set<string>();
    if (result.previousHighestBidderId) {
      usersToCheck.add(result.previousHighestBidderId);
    }
    usersToCheck.add(result.finalBidderId);

    for (const user of usersToCheck) {
      try {
        console.log(
          `[BID_SERVICE] Checking compliance for user ${user} after bid.`
        );
        await checkAndRecordCompliance(user, leagueId);
      } catch (error) {
        console.error(
          `[BID_SERVICE] Error checking compliance for user ${user}:`,
          error
        );
      }
    }

    // --- Gestione Timer di Risposta ---
    // Cancella timer per l'utente che ha rilanciato (se era lui a dover rispondere)
    try {
      const auctionInfoResult = await db.execute({
        sql: "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'",
        args: [leagueId, playerId],
      });
      const auctionInfoForCancel = auctionInfoResult.rows[0] as unknown as
        | { id: number }
        | undefined;
      if (auctionInfoForCancel) {
        await cancelResponseTimer(auctionInfoForCancel.id, userId);
      }
    } catch (error) {
      console.log(
        `[BID_SERVICE] Timer cancellation non-critical error: ${error}`
      );
    }

    // Crea timer pendente per l'utente superato
    if (
      result.previousHighestBidderId &&
      result.previousHighestBidderId !== result.finalBidderId
    ) {
      try {
        const auctionInfoResult = await db.execute({
          sql: "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'",
          args: [leagueId, playerId],
        });
        const auctionInfo = auctionInfoResult.rows[0] as unknown as
          | { id: number }
          | undefined;
        if (auctionInfo) {
          await createResponseTimer(
            auctionInfo.id,
            result.previousHighestBidderId
          );
        }
      } catch (error) {
        console.error(
          `[BID_SERVICE] Error creating response timer for outbid user: ${error}`
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

    // 1. Recupera i dati aggiornati per il payload arricchito
    const budgetUpdates = [];
    const getParticipantBudget = async (pUserId: string) => {
      const res = await db.execute({
        sql: `SELECT current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`,
        args: [leagueId, pUserId],
      });
      return res.rows[0] as unknown as
        | { current_budget: number; locked_credits: number }
        | undefined;
    };

    // Aggiungi budget del vincitore finale
    const finalWinnerBudget = await getParticipantBudget(finalBidderId);
    if (finalWinnerBudget) {
      budgetUpdates.push({
        userId: finalBidderId,
        newBudget: finalWinnerBudget.current_budget,
        newLockedCredits: finalWinnerBudget.locked_credits,
      });
    }

    // Aggiungi budget dell'offerente precedente (se diverso dal vincitore)
    if (previousHighestBidderId && previousHighestBidderId !== finalBidderId) {
      const previousBidderBudget = await getParticipantBudget(
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
    const auctionInfoForBidResult = await db.execute({
      sql: "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ?",
      args: [leagueId, playerId],
    });
    const auctionInfoForBid = auctionInfoForBidResult.rows[0] as unknown as {
      id: number;
    };

    // Recupera l'ultima offerta inserita
    const lastBidResult = await db.execute({
      sql: `SELECT id, user_id, amount, bid_time FROM bids WHERE auction_id = ? ORDER BY bid_time DESC LIMIT 1`,
      args: [auctionInfoForBid.id],
    });
    const lastBid = lastBidResult.rows[0] as unknown as
      | { id: number; user_id: string; amount: number; bid_time: string }
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
          bid_time: new Date(Number(lastBid.bid_time) * 1000).toISOString(),
        }
        : undefined,
    };

    console.log(
      `[BID_SERVICE] Notifying socket server with rich payload for auction-update.`
    );

    // 3. Invia l'evento `auction-update` arricchito
    await notifySocketServer({
      room: `league-${leagueId}`,
      event: "auction-update",
      data: richPayload,
    });

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
  }

  const message = result.autoBidActivated
    ? `Battaglia auto-bid conclusa! Vincitore: ${result.autoBidUsername || result.finalBidderId} con ${result.finalBidAmount} crediti.`
    : "Offerta piazzata con successo!";

  return { message };
}

export const getAuctionStatusForPlayer = async (
  leagueIdParam: number,
  playerIdParam: number
): Promise<AuctionStatusDetails | null> => {
  const currentTime = Math.floor(Date.now() / 1000);
  console.log(
    `[getAuctionStatusForPlayer] 🔍 CRITICAL DEBUG - Searching for auction: league=${leagueIdParam}, player=${playerIdParam}, currentTime=${currentTime}`
  );

  // ENHANCED: Use database transaction with proper isolation to prevent race conditions
  // In @libsql/client, we can just use a normal execute if we don't need a strict transaction for reading,
  // but if we want to ensure consistency we can use a transaction.
  // For reading, a simple execute is usually fine unless we need REPEATABLE READ.
  // We'll stick to execute for now as it's simpler and likely sufficient.

  const auctionResult = await db.execute({
    sql: `SELECT
        a.id, a.auction_league_id AS league_id, a.player_id, a.start_time,
        a.scheduled_end_time, a.current_highest_bid_amount, a.current_highest_bidder_id,
        a.status, a.created_at, a.updated_at,
        p.id as p_id, p.name AS player_name, p.role as player_role, p.team as player_team, p.photo_url as player_image,
        u.username AS current_highest_bidder_username
       FROM auctions a
       JOIN players p ON a.player_id = p.id
       LEFT JOIN users u ON a.current_highest_bidder_id = u.id
       WHERE a.auction_league_id = ? AND a.player_id = ?
         AND a.status IN ('active', 'closing')
         AND a.scheduled_end_time > ?
       ORDER BY a.updated_at DESC
       LIMIT 1`,
    args: [leagueIdParam, playerIdParam, currentTime],
  });

  const activeAuctionData = auctionResult.rows[0] as unknown as
    | (Omit<
      AuctionStatusDetails,
      "bid_history" | "time_remaining_seconds" | "player"
    > & {
      player_name: string;
      current_highest_bidder_username: string | null;
      p_id: number;
      player_role: string;
      player_team: string;
      player_image: string | null;
    })
    | undefined;

  if (activeAuctionData) {
    console.log(`[getAuctionStatusForPlayer] ✅ Found ACTIVE auction:`, {
      id: activeAuctionData.id,
      status: activeAuctionData.status,
    });

    // Return the active auction with full details
    const bidsResult = await db.execute({
      sql: `SELECT b.id, b.auction_id, b.user_id, b.amount, b.bid_time, b.bid_type, u.username as bidder_username FROM bids b JOIN users u ON b.user_id = u.id WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 10`,
      args: [activeAuctionData.id],
    });
    const bidHistory = bidsResult.rows as unknown as BidRecord[];

    const timeRemainingSeconds =
      activeAuctionData.status === "active" ||
        activeAuctionData.status === "closing"
        ? Math.max(
          0,
          activeAuctionData.scheduled_end_time - Math.floor(Date.now() / 1000)
        )
        : undefined;

    const { p_id, player_role, player_team, ...restOfAuctionData } =
      activeAuctionData;

    return {
      ...restOfAuctionData,
      player: {
        id: p_id,
        role: player_role,
        name: activeAuctionData.player_name,
        team: player_team,
        photo_url: activeAuctionData.player_image,
      },
      bid_history: bidHistory.reverse(),
      time_remaining_seconds: timeRemainingSeconds,
    };
  }

  return null;
};

export const processExpiredAuctionsAndAssignPlayers = async (): Promise<{
  processedCount: number;
  failedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  const getExpiredAuctionsResult = await db.execute({
    sql: `SELECT a.id, a.auction_league_id, a.player_id, a.current_highest_bid_amount, a.current_highest_bidder_id, p.role as player_role, p.name as player_name FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.status = 'active' AND a.scheduled_end_time <= ? AND a.current_highest_bidder_id IS NOT NULL AND a.current_highest_bid_amount > 0`,
    args: [now],
  });
  const expiredAuctions = getExpiredAuctionsResult.rows as unknown as ExpiredAuctionData[];

  if (expiredAuctions.length === 0)
    return { processedCount: 0, failedCount: 0, errors: [] };

  let processedCount = 0,
    failedCount = 0;
  const errors: string[] = [];

  for (const auction of expiredAuctions) {
    try {
      // Determina l'importo corretto da sbloccare
      const autoBidResult = await db.execute({
        sql: "SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE",
        args: [auction.id, auction.current_highest_bidder_id],
      });
      const autoBid = autoBidResult.rows[0] as unknown as
        | { max_amount: number }
        | undefined;

      const amountToUnlock =
        autoBid?.max_amount || auction.current_highest_bid_amount;

      const tx = await db.transaction("write");
      try {
        await tx.execute({
          sql: "UPDATE auctions SET status = 'sold', updated_at = ? WHERE id = ?",
          args: [now, auction.id],
        });

        // Disattiva TUTTI gli auto-bid per questa asta
        await tx.execute({
          sql: "UPDATE auto_bids SET is_active = FALSE, updated_at = ? WHERE auction_id = ?",
          args: [now, auction.id],
        });

        // Sblocca i crediti per tutti gli utenti che avevano auto-bid attivi (eccetto il vincitore)
        // FIX: Controlla is_active per evitare doppio sblocco di auto-bid già superati
        const allAutoBidsResult = await tx.execute({
          sql: "SELECT user_id, max_amount FROM auto_bids WHERE auction_id = ? AND user_id != ? AND is_active = TRUE",
          args: [auction.id, auction.current_highest_bidder_id],
        });
        const allAutoBidsForAuction = allAutoBidsResult.rows as unknown as {
          user_id: string;
          max_amount: number;
        }[];

        // FIX: Ricalcola locked_credits per tutti gli utenti invece di sottrarre incrementalmente
        const affectedUsers = new Set<string>();
        for (const otherAutoBid of allAutoBidsForAuction) {
          affectedUsers.add(otherAutoBid.user_id);
        }
        affectedUsers.add(auction.current_highest_bidder_id);

        for (const userId of affectedUsers) {
          // Ricalcola locked_credits come:
          // 1. Somma auto-bid attivi per aste attive
          // 2. PIÙ offerte manuali vincenti (senza auto-bid) per aste attive
          const userLockedCreditsResult = await tx.execute({
            sql: `
              SELECT
                COALESCE(
                  (SELECT SUM(ab.max_amount)
                   FROM auto_bids ab
                   JOIN auctions a ON ab.auction_id = a.id
                   WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
                  0
                ) +
                COALESCE(
                  (SELECT SUM(a.current_highest_bid_amount)
                   FROM auctions a
                   LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
                   WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
                     AND ab.id IS NULL
                     AND a.status IN ('active', 'closing')),
                  0
                ) as total_locked
            `,
            args: [auction.auction_league_id, userId, userId, auction.auction_league_id, userId],
          });
          const totalLocked = ((userLockedCreditsResult.rows[0] as unknown as { total_locked: number }).total_locked) || 0;

          await tx.execute({
            sql: "UPDATE league_participants SET locked_credits = ? WHERE league_id = ? AND user_id = ?",
            args: [totalLocked, auction.auction_league_id, userId],
          });
        }

        // Deduce il prezzo di acquisto dal budget del vincitore
        await tx.execute({
          sql: "UPDATE league_participants SET current_budget = current_budget - ? WHERE league_id = ? AND user_id = ?",
          args: [
            auction.current_highest_bid_amount,
            auction.auction_league_id,
            auction.current_highest_bidder_id,
          ],
        });

        const newBalanceResult = await tx.execute({
          sql: "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?",
          args: [
            auction.auction_league_id,
            auction.current_highest_bidder_id,
          ],
        });
        const newBalance = Number(newBalanceResult.rows[0].current_budget);

        await tx.execute({
          sql: `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, related_auction_id, related_player_id, description, balance_after_in_league, transaction_time) VALUES (?, ?, 'win_auction_debit', ?, ?, ?, ?, ?, ?)`,
          args: [
            auction.auction_league_id,
            auction.current_highest_bidder_id,
            auction.current_highest_bid_amount,
            auction.id,
            auction.player_id,
            `Acquisto ${auction.player_name || `ID ${auction.player_id}`}`,
            newBalance,
            now,
          ],
        });

        const col = `players_${auction.player_role}_acquired`;
        await tx.execute({
          sql: `UPDATE league_participants SET ${col} = ${col} + 1, updated_at = ? WHERE league_id = ? AND user_id = ?`,
          args: [
            now,
            auction.auction_league_id,
            auction.current_highest_bidder_id,
          ],
        });

        await tx.execute({
          sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price, assigned_at) VALUES (?, ?, ?, ?, ?)`,
          args: [
            auction.auction_league_id,
            auction.player_id,
            auction.current_highest_bidder_id,
            auction.current_highest_bid_amount,
            now,
          ],
        });

        await tx.commit();
      } catch (error) {
        await tx.rollback();
        throw error;
      }

      // TASK 1.2: Re-check compliance after player assignment
      await checkAndRecordCompliance(
        auction.current_highest_bidder_id,
        auction.auction_league_id
      );

      // NUOVO: Check compliance for all users who had auto-bids but didn't win
      // We need to fetch them again because we are outside the transaction now, or reuse the list if possible.
      // We'll fetch them again to be safe.
      const allAutoBidsForAuction = (
        await db.execute({
          sql: "SELECT user_id FROM auto_bids WHERE auction_id = ? AND user_id != ?",
          args: [auction.id, auction.current_highest_bidder_id],
        })
      ).rows as unknown as { user_id: string }[];

      for (const otherAutoBid of allAutoBidsForAuction) {
        try {
          console.log(
            `[AUCTION_EXPIRED] Checking compliance for user ${otherAutoBid.user_id} who lost auction ${auction.id}`
          );
          const complianceResult = await checkAndRecordCompliance(
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
      const allLosingBiddersResult = await db.execute({
        sql: "SELECT DISTINCT user_id FROM bids WHERE auction_id = ? AND user_id != ?",
        args: [auction.id, auction.current_highest_bidder_id],
      });
      const allLosingBidders = allLosingBiddersResult.rows as unknown as {
        user_id: string;
      }[];

      for (const losingBidder of allLosingBidders) {
        // Skip if already checked in auto-bid loop above
        if (
          !allAutoBidsForAuction.some(
            (ab) => ab.user_id === losingBidder.user_id
          )
        ) {
          try {
            console.log(
              `[AUCTION_EXPIRED] Checking compliance for manual bidder ${losingBidder.user_id} who lost auction ${auction.id}`
            );
            const complianceResult = await checkAndRecordCompliance(
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
