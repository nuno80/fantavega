// src/lib/db/services/bid.service.ts v.2.2
// Servizio completo per la logica delle offerte, con integrazione Socket.IO per notifiche in tempo reale.
// 1. Importazioni
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";
import { handleBidderChange } from "./auction-states.service";
import { canUserBidOnPlayer, getUserCooldownInfo, createResponseTimer, cancelResponseTimer } from "./response-timer.service";

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
  let currentBid = initialBid;
  let currentBidderId = initialBidderId;
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
  autoBids.forEach(ab => ab.isActive = true);

  // CORREZIONE: Controlla se ci sono auto-bid che possono competere
  // NOTA: Non escludere l'auto-bid dell'offerente - può competere con altri auto-bid
  const competingAutoBids = autoBids.filter(ab => ab.maxAmount > currentBid);
  
  if (competingAutoBids.length === 0) {
    // Nessun auto-bid può competere, l'offerta manuale vince
    console.log(`[AUTO_BID] Nessun auto-bid può competere con l'offerta manuale di ${currentBid}`);
    return {
      finalAmount: currentBid,
      finalBidderId: currentBidderId,
      battleSteps,
      totalSteps: step,
      initialBidderHadWinningManualBid: true,
    };
  }

  // Trova l'auto-bid vincente (massimo importo, poi priorità temporale)
  const winningAutoBid = competingAutoBids
    .sort((a, b) => {
      // Prima ordina per max_amount (decrescente)
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      // In caso di parità, ordina per createdAt (crescente = primo vince)
      return a.createdAt - b.createdAt;
    })[0];

  console.log(`[AUTO_BID] Auto-bid vincente: ${winningAutoBid.userId} con max ${winningAutoBid.maxAmount}`);

  // CORREZIONE: Calcola il prezzo finale secondo la logica eBay
  let finalAmount: number;
  
  // Trova il secondo miglior auto-bid (se esiste)
  const secondBestAutoBid = competingAutoBids
    .filter(ab => ab.userId !== winningAutoBid.userId)
    .sort((a, b) => {
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      return a.createdAt - b.createdAt;
    })[0];

  if (secondBestAutoBid) {
    console.log(`[AUTO_BID] Secondo miglior auto-bid: ${secondBestAutoBid.userId} con max ${secondBestAutoBid.maxAmount}`);
    
    if (secondBestAutoBid.maxAmount === winningAutoBid.maxAmount) {
      // CASO PARITÀ: il vincitore (primo per timestamp) paga il suo importo massimo
      finalAmount = winningAutoBid.maxAmount;
      console.log(`[AUTO_BID] PARITÀ rilevata! Vincitore paga importo massimo: ${finalAmount}`);
    } else {
      // Il vincitore paga 1 credito più del secondo migliore, ma non più del suo massimo
      finalAmount = Math.min(secondBestAutoBid.maxAmount + 1, winningAutoBid.maxAmount);
      console.log(`[AUTO_BID] Vincitore paga 1+ del secondo migliore: ${finalAmount}`);
    }
  } else {
    // Solo un auto-bid: paga 1 credito più dell'offerta manuale, ma non più del suo massimo
    finalAmount = Math.min(currentBid + 1, winningAutoBid.maxAmount);
    console.log(`[AUTO_BID] Solo un auto-bid, paga 1+ dell'offerta manuale: ${finalAmount}`);
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
  // Check if user is in cooldown for this player (48h after abandoning) - BEFORE transaction
  const cooldownInfo = getUserCooldownInfo(bidderUserIdParam, playerIdParam, leagueIdParam);
  if (!cooldownInfo.canBid) {
    throw new Error(cooldownInfo.message || "Non puoi avviare un'asta per questo giocatore. Hai un cooldown attivo.");
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
    if (league.status !== "draft_active" && league.status !== "repair_active")
      throw new Error(
        `Le offerte non sono attive per la lega (status: ${league.status}).`
      );

    const playerStmt = db.prepare("SELECT id, role, name, current_quotation FROM players WHERE id = ?");
    const player = playerStmt.get(playerIdParam) as
      | (PlayerForBidding & { current_quotation: number })
      | undefined;
    if (!player)
      throw new Error(`Giocatore con ID ${playerIdParam} non trovato.`);

    // Determine the minimum bid based on league configuration
    let minimumBid = league.min_bid; // Default fallback
    
    try {
      const config = JSON.parse(league.config_json);
      if (config.min_bid_rule === "player_quotation" && player.current_quotation > 0) {
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
  autoBidMaxAmount, // Add this parameter
}: PlaceBidParams) {
  console.log(`[BID_SERVICE] placeBidOnExistingAuction called for user ${userId}, player ${playerId}, amount ${bidAmount}`);
  
  // Check if user is in cooldown for this player (48h after abandoning) - BEFORE transaction
  const cooldownInfo = getUserCooldownInfo(userId, playerId, leagueId);
  if (!cooldownInfo.canBid) {
    console.error(`[BID_SERVICE] User ${userId} in cooldown for player ${playerId}: ${cooldownInfo.message}`);
    throw new Error(cooldownInfo.message || "Non puoi fare offerte per questo giocatore. Hai un cooldown attivo.");
  }

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
      console.error(`[BID_SERVICE] Auction not found or not active for league ${leagueId}, player ${playerId}`);
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
    console.log(`[BID_SERVICE] Previous highest bidder: ${previousHighestBidderId}`);

    // First, process the user's bid normally if it's valid
    if (bidAmount <= auction.current_highest_bid_amount) {
      console.error(`[BID_SERVICE] Bid amount ${bidAmount} not higher than current ${auction.current_highest_bid_amount}`);
      throw new Error(`L'offerta deve essere superiore all'offerta attuale di ${auction.current_highest_bid_amount} crediti.`);
    }
    
    // Check if user is already highest bidder, but allow if they can counter-bid
    if (previousHighestBidderId === userId) {
      // Con il nuovo sistema di stati, controlliamo se l'utente può fare rilancio
      const canCounterBid = db.prepare(`
        SELECT 1 FROM user_auction_response_timers 
        WHERE auction_id = ? AND user_id = ? AND status = 'pending'
      `).get(auction.id, userId);
      
      // Verifica anche se l'utente ha uno stato 'rilancio_possibile' nell'asta
      const auctionStates = auction.user_auction_states ? JSON.parse(auction.user_auction_states) : {};
      const userState = auctionStates[userId];
      const hasRilancioPossibile = userState === 'rilancio_possibile';
      
      if (!canCounterBid && !hasRilancioPossibile) {
        console.error(`[BID_SERVICE] User ${userId} is already highest bidder and cannot counter-bid. Timer: ${!!canCounterBid}, State: ${userState}`);
        throw new Error("Sei già il miglior offerente.");
      }
      
      console.log(`[BID_SERVICE] User ${userId} is highest bidder but can counter-bid (Timer: ${!!canCounterBid}, State: ${userState})`);
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
      const activeRoles = league.active_auction_roles.toUpperCase() === "ALL" 
        ? ["P", "D", "C", "A"] 
        : league.active_auction_roles.split(",").map(r => r.trim().toUpperCase());
      
      if (!activeRoles.includes(player.role.toUpperCase())) {
        console.error(`[BID_SERVICE] Player role ${player.role} not in active roles: ${league.active_auction_roles}`);
        throw new Error(`Le aste per il ruolo ${player.role} non sono attualmente attive. Ruoli attivi: ${league.active_auction_roles}`);
      }
    }
    const participant = db
      .prepare(
        `SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`
      )
      .get(leagueId, userId) as ParticipantForBidding | undefined;
    if (!participant) {
      console.error(`[BID_SERVICE] Participant ${userId} not found for league ${leagueId}`);
      throw new Error(
        `Operazione non autorizzata: non fai parte di questa lega`
      );
    }
    console.log(`[BID_SERVICE] Participant info: ${JSON.stringify(participant)}`);

    // Add this validation before slot/budget checks
    if (participant.user_id !== userId) {
      console.error(`[BID_SERVICE] User ${userId} attempting to bid for another team`);
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

    // Blocchi 3, 4, e 5 sono stati rimossi. La loro logica è ora gestita dal Blocco 6.

    // --- Blocco 6: Logica di Simulazione Auto-Bid ---
    console.log(`[BID_SERVICE] Avvio logica di simulazione auto-bid...`);

    // NEW: Upsert auto-bid within the same transaction if provided
    if (autoBidMaxAmount && autoBidMaxAmount > 0) {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active, created_at, updated_at)
        VALUES (?, ?, ?, TRUE, ?, ?)
        ON CONFLICT(auction_id, user_id) 
        DO UPDATE SET 
          max_amount = excluded.max_amount,
          is_active = TRUE,
          updated_at = excluded.updated_at
      `).run(auction.id, userId, autoBidMaxAmount, now, now);
      console.log(`[BID_SERVICE] Auto-bid for user ${userId} upserted to ${autoBidMaxAmount}`);
    }

    // 1. Raccogli tutti gli auto-bid attivi per l'asta, inclusi quelli dell'offerente attuale
    // CORREZIONE: Usa READ UNCOMMITTED per vedere auto-bid creati in transazioni parallele
    const allActiveAutoBids = db
      .prepare(
        `SELECT user_id as userId, max_amount as maxAmount, created_at as createdAt
         FROM auto_bids
         WHERE auction_id = ? AND is_active = TRUE
         ORDER BY created_at ASC`
      )
      .all(auction.id) as Omit<AutoBidBattleParticipant, 'isActive'>[];
    
    console.log(`[BID_SERVICE] Trovati ${allActiveAutoBids.length} auto-bid attivi: ${JSON.stringify(allActiveAutoBids)}`);

    // 2. Esegui la simulazione della battaglia
    const battleResult = simulateAutoBidBattle(bidAmount, userId, allActiveAutoBids.map(ab => ({...ab, isActive: true})));
    
    console.log(`[BID_SERVICE] Risultato simulazione: ${JSON.stringify(battleResult, null, 2)}`);

    const { finalAmount, finalBidderId, battleSteps } = battleResult;

    // 3. Applica il risultato della battaglia al database
    
    // Annulla il lock dei crediti del precedente miglior offerente (se esisteva)
    if (previousHighestBidderId) {
      decrementLockedCreditsStmt.run(auction.current_highest_bid_amount, leagueId, previousHighestBidderId);
      console.log(`[BID_SERVICE] Sbloccati ${auction.current_highest_bid_amount} crediti per l'utente ${previousHighestBidderId}`);
    }

    // L'offerta manuale non blocca crediti; solo il risultato finale della battaglia lo fa.
    // La riga che sbloccava i crediti per l'offerente manuale è stata rimossa.

    // Valida budget e slot per il vincitore finale
    const finalWinnerParticipant = db
      .prepare(`SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?`)
      .get(leagueId, finalBidderId) as ParticipantForBidding | undefined;

    if (!finalWinnerParticipant) {
      throw new Error(`Partecipante vincitore ${finalBidderId} non trovato.`);
    }

    checkSlotsAndBudgetOrThrow(league, player, finalWinnerParticipant, finalBidderId, finalAmount, false, playerId);
    console.log(`[BID_SERVICE] Budget e slot validi per il vincitore finale ${finalBidderId}.`);

    // Blocca i crediti per il vincitore finale
    incrementLockedCreditsStmt.run(finalAmount, leagueId, finalBidderId);
    console.log(`[BID_SERVICE] Bloccati ${finalAmount} crediti per il vincitore finale ${finalBidderId}.`);

    // Aggiorna l'asta con il risultato finale
    const newScheduledEndTime = Math.floor(Date.now() / 1000) + league.timer_duration_minutes * 60;
    db.prepare(
      `UPDATE auctions SET current_highest_bid_amount = ?, current_highest_bidder_id = ?, scheduled_end_time = ?, updated_at = strftime('%s', 'now') WHERE id = ?`
    ).run(finalAmount, finalBidderId, newScheduledEndTime, auction.id);
    console.log(`[BID_SERVICE] Asta ${auction.id} aggiornata. Vincitore: ${finalBidderId}, Importo: ${finalAmount}`);

    // Inserisci solo l'offerta finale nel DB per mantenere la cronologia pulita
    const finalBidType = battleResult.initialBidderHadWinningManualBid ? bidType : 'auto';
    db.prepare(
      `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, strftime('%s', 'now'), ?)`
    ).run(auction.id, finalBidderId, finalAmount, finalBidType);
    console.log(`[BID_SERVICE] Inserito bid finale nel database.`);

    // Logging della battaglia per debug
    console.log(`[BID_SERVICE] Battaglia auto-bid completata in ${battleResult.totalSteps} steps.`);
    console.log(`[BID_SERVICE] Sequenza battaglia:`, battleSteps);

    const autoBidActivated = finalBidderId !== userId || !battleResult.initialBidderHadWinningManualBid;
    
    return {
      success: true,
      previousHighestBidderId: previousHighestBidderId,
      newScheduledEndTime,
      playerName: db.prepare(`SELECT name FROM players WHERE id = ?`).get(playerId) as { name: string } | undefined,
      autoBidActivated,
      autoBidUserId: autoBidActivated ? finalBidderId : undefined,
      autoBidUsername: autoBidActivated ? (db.prepare(`SELECT username FROM users WHERE id = ?`).get(finalBidderId) as {username: string} | undefined)?.username : undefined,
      autoBidAmount: finalAmount,
      finalBidAmount: finalAmount,
      finalBidderId: finalBidderId,
    };
  });

  const result = transaction();
  console.log(`[BID_SERVICE] Transaction completed. Result: ${JSON.stringify(result)}`);

  // --- Gestione Timer di Risposta ---
  if (result.success) {
    // Cancella timer per l'utente che ha rilanciato (non serve più)
    try {
      const auctionInfoForCancel = db.prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'").get(leagueId, playerId) as { id: number } | undefined;
      if (auctionInfoForCancel) {
        await cancelResponseTimer(auctionInfoForCancel.id, userId);
        console.log(`[BID_SERVICE] Timer cancellato per l'utente ${userId}`);
      }
    } catch (error) {
      console.log(`[BID_SERVICE] Timer cancellation non-critical error: ${error}`);
    }

    // Crea timer pendente per l'utente superato
    const finalPreviousHighestBidderId = result.autoBidActivated ? userId : result.previousHighestBidderId;
    if (finalPreviousHighestBidderId && finalPreviousHighestBidderId !== (result.autoBidActivated ? result.autoBidUserId : userId)) {
      try {
        const auctionInfo = db.prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
          .get(leagueId, playerId) as { id: number } | undefined;
        if (auctionInfo) {
          await createResponseTimer(auctionInfo.id, finalPreviousHighestBidderId);
          console.log(`[BID_SERVICE] Timer creato per l'utente superato ${finalPreviousHighestBidderId}`);
        }
      } catch (error) {
        console.error(`[BID_SERVICE] Error creating response timer: ${error}`);
      }
    }
  }

  // --- Blocco 7: Invio Notifiche Socket.IO ---
  if (result.success) {
    console.log(`[BID_SERVICE] Notifying socket server for auction-update. Final bid: ${result.finalBidAmount}, Final bidder: ${result.finalBidderId}`);
    
    await notifySocketServer({
      room: `league-${leagueId}`,
      event: "auction-update",
      data: {
        playerId,
        newPrice: result.finalBidAmount,
        highestBidderId: result.finalBidderId,
        scheduledEndTime: result.newScheduledEndTime,
        autoBidActivated: result.autoBidActivated,
      },
    });

    // Notifica all'utente che è stato superato (se non è il vincitore finale)
    const surpassedUsers = new Set<string>();
    if (result.previousHighestBidderId && result.previousHighestBidderId !== result.finalBidderId) {
      surpassedUsers.add(result.previousHighestBidderId);
    }
    if (userId !== result.finalBidderId) {
      surpassedUsers.add(userId);
    }

    for (const surpassedUserId of surpassedUsers) {
      console.log(`[BID_SERVICE] Notifying user ${surpassedUserId} of being surpassed.`);
      await notifySocketServer({
        room: `user-${surpassedUserId}`,
        event: "bid-surpassed-notification",
        data: {
          playerName: result.playerName?.name || "Giocatore",
          newBidAmount: result.finalBidAmount,
          autoBidActivated: true, // La notifica è sempre dovuta a una battaglia
          autoBidUsername: result.autoBidUsername,
        },
      });
    }

    // Notifica al vincitore se il suo auto-bid è stato attivato
    if (result.autoBidActivated && result.finalBidderId === result.autoBidUserId) {
      console.log(`[BID_SERVICE] Notifying auto-bidder (${result.autoBidUserId}) of auto-bid activation.`);
      await notifySocketServer({
        room: `user-${result.autoBidUserId}`,
        event: "auto-bid-activated-notification",
        data: {
          playerName: result.playerName?.name || "Giocatore",
          bidAmount: result.finalBidAmount,
          triggeredBy: userId, // L'utente che ha iniziato la battaglia
        },
      });
    }

    // Gestisci cambio stato per tutti gli utenti superati
    const auctionInfo = db.prepare("SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active'")
      .get(leagueId, playerId) as { id: number } | undefined;
    
    if (auctionInfo) {
      for (const surpassedUserId of surpassedUsers) {
        console.log(`[BID_SERVICE] Handling state change for user ${surpassedUserId}, auction ${auctionInfo.id}`);
        await handleBidderChange(auctionInfo.id, surpassedUserId, result.finalBidderId!);
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
     ORDER BY CASE a.status WHEN 'active' THEN 1 WHEN 'closing' THEN 2 ELSE 3 END, a.updated_at DESC 
     LIMIT 1`
  );
  const auctionData = auctionStmt.get(leagueIdParam, playerIdParam) as
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

  const { p_id, player_role, player_team, ...restOfAuctionData } = auctionData;

  return {
    ...restOfAuctionData,
    player: {
      id: p_id,
      role: player_role,
      name: auctionData.player_name,
      team: player_team,
    },
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
