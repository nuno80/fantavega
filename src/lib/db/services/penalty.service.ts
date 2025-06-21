// src/lib/db/services/penalty.service.ts v.1.0
// Servizio per la logica di business relativa al sistema di penalità.
// 1. Importazioni
import { db } from "@/lib/db";

import type { AuctionLeague } from "./auction-league.service";

// Assumendo che AuctionLeague sia esportata da lì
// o definisci un tipo locale se preferisci.

// 2. Tipi e Interfacce Specifiche per le Penalità
interface UserLeagueComplianceStatus {
  league_id: number;
  user_id: string;
  phase_identifier: string;
  compliance_timer_start_at: number | null;
  last_penalty_applied_for_hour_ending_at: number | null;
  penalties_applied_this_cycle: number;
  // created_at e updated_at sono gestiti dal DB
}

interface SlotRequirements {
  P: number;
  D: number;
  C: number;
  A: number;
}

const PENALTY_AMOUNT = 5;
const MAX_PENALTIES_PER_CYCLE = 5;
const COMPLIANCE_GRACE_PERIOD_HOURS = 1; // 1 ora di grazia/osservazione

// 3. Funzioni Helper (interne al modulo)

/**
 * Genera un identificatore univoco per la fase d'asta corrente di una lega.
 * Basato sullo status della lega e sui ruoli attivi.
 */
const getCurrentPhaseIdentifier = (
  leagueStatus: string,
  activeRolesString: string | null
): string => {
  if (
    !activeRolesString ||
    activeRolesString.trim() === "" ||
    activeRolesString.toUpperCase() === "ALL"
  ) {
    return `${leagueStatus}_ALL_ROLES`;
  }
  const sortedRoles = activeRolesString
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .sort()
    .join(",");
  return `${leagueStatus}_${sortedRoles}`;
};

/**
 * Calcola il numero di slot N-1 richiesti per ogni ruolo attivo.
 */
const calculateRequiredSlotsMinusOne = (
  league: Pick<
    AuctionLeague,
    "slots_P" | "slots_D" | "slots_C" | "slots_A" | "active_auction_roles"
  >
): SlotRequirements => {
  const requirements: SlotRequirements = { P: 0, D: 0, C: 0, A: 0 };
  if (
    !league.active_auction_roles ||
    league.active_auction_roles.toUpperCase() === "NONE"
  ) {
    return requirements; // Nessun ruolo attivo, nessun requisito
  }

  const activeRoles =
    league.active_auction_roles.toUpperCase() === "ALL"
      ? ["P", "D", "C", "A"]
      : league.active_auction_roles
          .split(",")
          .map((r) => r.trim().toUpperCase());

  if (activeRoles.includes("P"))
    requirements.P = Math.max(0, league.slots_P - 1);
  if (activeRoles.includes("D"))
    requirements.D = Math.max(0, league.slots_D - 1);
  if (activeRoles.includes("C"))
    requirements.C = Math.max(0, league.slots_C - 1);
  if (activeRoles.includes("A"))
    requirements.A = Math.max(0, league.slots_A - 1);

  return requirements;
};

/**
 * Conta quanti slot sono effettivamente coperti da un utente per ogni ruolo.
 * Considera giocatori assegnati e aste attive vincenti.
 */
const countCoveredSlots = (
  leagueId: number,
  userId: string
): SlotRequirements => {
  const covered: SlotRequirements = { P: 0, D: 0, C: 0, A: 0 };

  // Conta giocatori assegnati
  const assignmentsStmt = db.prepare(
    `SELECT p.role, COUNT(pa.player_id) as count
     FROM player_assignments pa
     JOIN players p ON pa.player_id = p.id
     WHERE pa.auction_league_id = ? AND pa.user_id = ?
     GROUP BY p.role`
  );
  const assignments = assignmentsStmt.all(leagueId, userId) as {
    role: string;
    count: number;
  }[];
  for (const assign of assignments) {
    if (assign.role in covered)
      covered[assign.role as keyof SlotRequirements] += assign.count;
  }

  // Conta aste attive vincenti
  const activeWinningBidsStmt = db.prepare(
    `SELECT p.role, COUNT(DISTINCT a.player_id) as count
     FROM auctions a
     JOIN players p ON a.player_id = p.id
     WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND a.status = 'active'
     GROUP BY p.role`
  );
  const winningBids = activeWinningBidsStmt.all(leagueId, userId) as {
    role: string;
    count: number;
  }[];
  for (const bid of winningBids) {
    if (bid.role in covered)
      covered[bid.role as keyof SlotRequirements] += bid.count;
  }
  return covered;
};

/**
 * Verifica se l'utente è conforme ai requisiti N-1 per i ruoli attivi.
 */
const checkUserCompliance = (
  requiredSlotsNMinusOne: SlotRequirements,
  coveredSlots: SlotRequirements,
  activeRolesString: string | null
): boolean => {
  if (!activeRolesString || activeRolesString.toUpperCase() === "NONE")
    return true; // Se nessun ruolo attivo, è conforme

  const activeRoles =
    activeRolesString.toUpperCase() === "ALL"
      ? ["P", "D", "C", "A"]
      : activeRolesString.split(",").map((r) => r.trim().toUpperCase());

  for (const role of activeRoles) {
    const key = role as keyof SlotRequirements;
    if (coveredSlots[key] < requiredSlotsNMinusOne[key]) {
      return false; // Non conforme se anche un solo ruolo attivo non rispetta N-1
    }
  }
  return true; // Conforme se tutti i ruoli attivi rispettano N-1
};

// 4. Funzione Principale Esportata del Servizio Penalità
export const processUserComplianceAndPenalties = async (
  leagueId: number,
  userId: string
): Promise<{
  appliedPenaltyAmount: number;
  isNowCompliant: boolean;
  message: string;
}> => {
  const now = Math.floor(Date.now() / 1000);
  let appliedPenaltyAmount = 0;
  let finalMessage = "Compliance check processed.";

  // Inizia una transazione per tutte le operazioni
  const transaction = db.transaction(() => {
    // 4.1. Recupera info sulla lega (status, ruoli attivi, slot)
    const leagueStmt = db.prepare(
      "SELECT id, status, active_auction_roles, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?"
    );
    const league = leagueStmt.get(leagueId) as
      | Pick<
          AuctionLeague,
          | "id"
          | "status"
          | "active_auction_roles"
          | "slots_P"
          | "slots_D"
          | "slots_C"
          | "slots_A"
        >
      | undefined;

    if (!league || !["draft_active", "repair_active"].includes(league.status)) {
      // Penalità solo in fasi d'asta attive
      finalMessage = `League ${leagueId} not found or not in an active penalty phase (Status: ${league?.status}). No action taken.`;
      console.log(`[SERVICE PENALTY] ${finalMessage}`);
      return; // Esce dalla transazione e dalla funzione
    }

    const phaseIdentifier = getCurrentPhaseIdentifier(
      league.status,
      league.active_auction_roles
    );

    // 4.2. Recupera o crea il record di compliance per l'utente/lega/fase
    const getComplianceStmt = db.prepare(
      "SELECT * FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?"
    );
    let complianceRecord = getComplianceStmt.get(
      leagueId,
      userId,
      phaseIdentifier
    ) as UserLeagueComplianceStatus | undefined;

    const upsertComplianceStmt = db.prepare(
      `INSERT INTO user_league_compliance_status 
         (league_id, user_id, phase_identifier, compliance_timer_start_at, last_penalty_applied_for_hour_ending_at, penalties_applied_this_cycle, created_at, updated_at)
       VALUES (@league_id, @user_id, @phase_identifier, @compliance_timer_start_at, NULL, 0, @now, @now)
       ON CONFLICT(league_id, user_id, phase_identifier) DO UPDATE SET
         compliance_timer_start_at = COALESCE(excluded.compliance_timer_start_at, user_league_compliance_status.compliance_timer_start_at),
         -- Non resettiamo last_penalty_applied_for_hour_ending_at e penalties_applied_this_cycle qui, lo fa la logica sotto
         updated_at = @now`
    );

    let isNewComplianceRecord = false;
    if (!complianceRecord) {
      console.log(
        `[SERVICE PENALTY] No compliance record for user ${userId}, league ${leagueId}, phase ${phaseIdentifier}. Creating one.`
      );
      upsertComplianceStmt.run({
        league_id: leagueId,
        user_id: userId,
        phase_identifier: phaseIdentifier,
        compliance_timer_start_at: now, // Inizia il timer di grazia ora
        now: now,
      });
      complianceRecord = getComplianceStmt.get(
        leagueId,
        userId,
        phaseIdentifier
      ) as UserLeagueComplianceStatus; // Rileggi
      isNewComplianceRecord = true;
      if (!complianceRecord)
        throw new Error(
          "Failed to create or retrieve compliance record after insert."
        );
    }

    // 4.3. Verifica la conformità attuale dell'utente
    const requiredSlots = calculateRequiredSlotsMinusOne(league);
    const coveredSlots = countCoveredSlots(leagueId, userId);
    const isCurrentlyCompliant = checkUserCompliance(
      requiredSlots,
      coveredSlots,
      league.active_auction_roles
    );

    console.log(
      `[SERVICE PENALTY] User ${userId}: Required N-1 slots: P:${requiredSlots.P},D:${requiredSlots.D},C:${requiredSlots.C},A:${requiredSlots.A}`
    );
    console.log(
      `[SERVICE PENALTY] User ${userId}: Covered slots: P:${coveredSlots.P},D:${coveredSlots.D},C:${coveredSlots.C},A:${coveredSlots.A}`
    );
    console.log(
      `[SERVICE PENALTY] User ${userId} is currently compliant: ${isCurrentlyCompliant}`
    );

    // 4.4. Logica di Applicazione Penalità
    let timerToUseForPenaltyCalc = complianceRecord.compliance_timer_start_at;

    if (isNewComplianceRecord) {
      // Se è il primo check per questa fase/utente
      // Il timer di grazia di 1 ora è appena partito, nessuna penalità ora.
      console.log(
        `[SERVICE PENALTY] First check for user ${userId} in phase ${phaseIdentifier}. Grace period started at ${new Date(timerToUseForPenaltyCalc! * 1000).toISOString()}. No penalty applied now.`
      );
      // Assicuriamoci che se diventa non conforme, il timer parta da questo momento
      if (
        !isCurrentlyCompliant &&
        complianceRecord.compliance_timer_start_at === null
      ) {
        db.prepare(
          "UPDATE user_league_compliance_status SET compliance_timer_start_at = ?, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?"
        ).run(now, now, leagueId, userId, phaseIdentifier);
        complianceRecord.compliance_timer_start_at = now; // Aggiorna record locale
        console.log(
          `[SERVICE PENALTY] User ${userId} is not compliant. Compliance timer explicitly set to start now.`
        );
      }
    } else if (!isCurrentlyCompliant) {
      if (complianceRecord.compliance_timer_start_at === null) {
        // Era conforme, ora non lo è più (es. offerta superata). Inizia il timer.
        db.prepare(
          "UPDATE user_league_compliance_status SET compliance_timer_start_at = ?, penalties_applied_this_cycle = 0, last_penalty_applied_for_hour_ending_at = NULL, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?"
        ).run(now, now, leagueId, userId, phaseIdentifier);
        complianceRecord.compliance_timer_start_at = now;
        complianceRecord.penalties_applied_this_cycle = 0;
        complianceRecord.last_penalty_applied_for_hour_ending_at = null;
        console.log(
          `[SERVICE PENALTY] User ${userId} became non-compliant. Compliance timer reset. Grace period started.`
        );
        timerToUseForPenaltyCalc = now;
      }

      // Se il timer di grazia è partito (timerToUseForPenaltyCalc non è null)
      if (timerToUseForPenaltyCalc) {
        const gracePeriodEndTime =
          timerToUseForPenaltyCalc + COMPLIANCE_GRACE_PERIOD_HOURS * 3600;

        if (now >= gracePeriodEndTime) {
          // Periodo di grazia di 1 ora scaduto
          console.log(
            `[SERVICE PENALTY] User ${userId} grace period ended at ${new Date(gracePeriodEndTime * 1000).toISOString()}. Still not compliant.`
          );

          // Calcola quante ore di penalità sono maturate dall'ultima applicata (o dall'inizio del timer di non conformità)
          const refTimeForPenaltyHours =
            complianceRecord.last_penalty_applied_for_hour_ending_at ||
            gracePeriodEndTime;
          const hoursSinceLastPenaltyOrGraceEnd = Math.floor(
            (now - refTimeForPenaltyHours) / 3600
          );

          if (
            hoursSinceLastPenaltyOrGraceEnd >= 1 &&
            complianceRecord.penalties_applied_this_cycle <
              MAX_PENALTIES_PER_CYCLE
          ) {
            const penaltiesToApplyThisTime = Math.min(
              hoursSinceLastPenaltyOrGraceEnd,
              MAX_PENALTIES_PER_CYCLE -
                complianceRecord.penalties_applied_this_cycle
            );

            console.log(
              `[SERVICE PENALTY] Applying ${penaltiesToApplyThisTime} penalty/ies of ${PENALTY_AMOUNT} credits each.`
            );

            for (let i = 0; i < penaltiesToApplyThisTime; i++) {
              if (
                complianceRecord.penalties_applied_this_cycle >=
                MAX_PENALTIES_PER_CYCLE
              )
                break;

              // Applica deduzione budget
              const budgetUpdateStmt = db.prepare(
                "UPDATE league_participants SET current_budget = current_budget - ?, updated_at = ? WHERE league_id = ? AND user_id = ?"
              );
              const budgetUpdateResult = budgetUpdateStmt.run(
                PENALTY_AMOUNT,
                now,
                leagueId,
                userId
              );
              if (budgetUpdateResult.changes === 0)
                throw new Error(
                  `Failed to update budget for penalty for user ${userId}.`
                );

              appliedPenaltyAmount += PENALTY_AMOUNT;

              // Logga transazione budget
              const participantBudgetStmt = db.prepare(
                "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?"
              );
              const updatedParticipant = participantBudgetStmt.get(
                leagueId,
                userId
              ) as { current_budget: number };

              const budgetTxStmt = db.prepare(
                `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, description, balance_after_in_league, transaction_time) VALUES (?, ?, 'penalty_requirement', ?, ?, ?, ?)`
              );
              budgetTxStmt.run(
                leagueId,
                userId,
                PENALTY_AMOUNT,
                `Penalità per mancato rispetto requisiti rosa (Ora ${complianceRecord.penalties_applied_this_cycle + 1}/${MAX_PENALTIES_PER_CYCLE}).`,
                updatedParticipant.current_budget,
                now
              );

              complianceRecord.penalties_applied_this_cycle++;
            }
            // Aggiorna lo stato di compliance con l'ora dell'ultima penalità e il conteggio
            db.prepare(
              "UPDATE user_league_compliance_status SET last_penalty_applied_for_hour_ending_at = ?, penalties_applied_this_cycle = ?, compliance_timer_start_at = ?, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?"
            ).run(
              now,
              complianceRecord.penalties_applied_this_cycle,
              now,
              now,
              leagueId,
              userId,
              phaseIdentifier
            ); // Resetta il timer di osservazione da ora
            finalMessage = `Applied ${appliedPenaltyAmount} credits in penalties. User remains non-compliant. Next check in 1 hour.`;
            console.log(
              `[SERVICE PENALTY] ${finalMessage} Penalties this cycle: ${complianceRecord.penalties_applied_this_cycle}.`
            );
          } else if (
            complianceRecord.penalties_applied_this_cycle >=
            MAX_PENALTIES_PER_CYCLE
          ) {
            finalMessage = `User ${userId} has reached the maximum penalties for this compliance cycle. No further penalties applied.`;
            console.log(`[SERVICE PENALTY] ${finalMessage}`);
          } else {
            finalMessage = `User ${userId} is non-compliant, but not enough time passed for next penalty or max penalties reached.`;
            console.log(
              `[SERVICE PENALTY] ${finalMessage} Last penalty at: ${complianceRecord.last_penalty_applied_for_hour_ending_at ? new Date(complianceRecord.last_penalty_applied_for_hour_ending_at * 1000).toISOString() : "N/A"}`
            );
          }
        } else {
          finalMessage = `User ${userId} is non-compliant, but still within the 1-hour grace period (ends at ${new Date(gracePeriodEndTime * 1000).toISOString()}).`;
          console.log(`[SERVICE PENALTY] ${finalMessage}`);
        }
      }
    } else {
      // Utente è CONFORME ORA
      if (
        complianceRecord.compliance_timer_start_at !== null ||
        complianceRecord.penalties_applied_this_cycle > 0
      ) {
        // Era non conforme o sotto osservazione, ma ora è ok. Resetta il ciclo.
        db.prepare(
          "UPDATE user_league_compliance_status SET compliance_timer_start_at = NULL, last_penalty_applied_for_hour_ending_at = NULL, penalties_applied_this_cycle = 0, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?"
        ).run(now, leagueId, userId, phaseIdentifier);
        finalMessage = `User ${userId} is now compliant. Penalty cycle reset.`;
        console.log(`[SERVICE PENALTY] ${finalMessage}`);
      } else {
        finalMessage = `User ${userId} is compliant. No action needed.`;
        console.log(`[SERVICE PENALTY] ${finalMessage}`);
      }
    }
    // Restituisce lo stato di conformità attuale dopo il processo
    return { isNowCompliant: isCurrentlyCompliant };
  }); // Fine della funzione per la transazione principale

  try {
    const result = transaction(); // Esegui la transazione
    return {
      appliedPenaltyAmount,
      isNowCompliant: result ? result.isNowCompliant : false, // Se transaction() non ha fatto return per uscita anticipata
      message: finalMessage,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error processing compliance.";
    console.error(
      `[SERVICE PENALTY] Critical error for user ${userId}, league ${leagueId}: ${errorMessage}`,
      error
    );
    throw new Error(
      `Failed to process user compliance and penalties: ${errorMessage}`
    );
  }
};
