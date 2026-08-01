// src/lib/db/services/bid-validation.ts
// Tipi e validazioni pure per le offerte: controllo slot e budget.
// checkSlotsAndBudgetOrThrow accetta sia db che una transazione
// (stesso pattern di recalculateLockedCreditsForUser).
// Solo import di tipo: nessun side-effect a runtime.
import type { db } from "@/lib/db";
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

// 3. Funzione Helper Interna per Controllo Slot e Budget (ASYNC)
// MODIFICA v3.1: Aggiunta validazione che riserva 1 credito per ogni slot vuoto rimanente
// MODIFICA v3.2: Aggiunto parametro txClient per garantire isolamento transazionale
export const checkSlotsAndBudgetOrThrow = async (
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
