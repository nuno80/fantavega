// src/lib/db/services/penalty.service.ts v.1.1
// Servizio per la logica di business relativa al sistema di penalità, con notifiche real-time.

// 1. Importazioni
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter"; // <-- NUOVA IMPORTAZIONE
import type { AuctionLeague } from "./auction-league.service";

// 2. Tipi e Interfacce
// ... (il resto dei tipi rimane invariato)
interface UserLeagueComplianceStatus {
  league_id: number;
  user_id: string;
  phase_identifier: string;
  compliance_timer_start_at: number | null;
  last_penalty_applied_for_hour_ending_at: number | null;
  penalties_applied_this_cycle: number;
}
interface SlotRequirements { P: number; D: number; C: number; A: number; }

// 3. Costanti
const PENALTY_AMOUNT = 5;
const MAX_PENALTIES_PER_CYCLE = 5;
const COMPLIANCE_GRACE_PERIOD_HOURS = 1;

// 4. Funzioni Helper (interne)
// ... (tutte le funzioni helper rimangono invariate)
const getCurrentPhaseIdentifier = (leagueStatus: string, activeRolesString: string | null): string => {
  if (!activeRolesString || activeRolesString.trim() === "" || activeRolesString.toUpperCase() === "ALL") {
    return `${leagueStatus}_ALL_ROLES`;
  }
  const sortedRoles = activeRolesString.split(",").map((r) => r.trim().toUpperCase()).sort().join(",");
  return `${leagueStatus}_${sortedRoles}`;
};

const calculateRequiredSlotsMinusOne = (league: Pick<AuctionLeague, "slots_P" | "slots_D" | "slots_C" | "slots_A" | "active_auction_roles">): SlotRequirements => {
  const requirements: SlotRequirements = { P: 0, D: 0, C: 0, A: 0 };
  if (!league.active_auction_roles || league.active_auction_roles.toUpperCase() === "NONE") return requirements;
  const activeRoles = league.active_auction_roles.toUpperCase() === "ALL" ? ["P", "D", "C", "A"] : league.active_auction_roles.split(",").map((r) => r.trim().toUpperCase());
  if (activeRoles.includes("P")) requirements.P = Math.max(0, league.slots_P - 1);
  if (activeRoles.includes("D")) requirements.D = Math.max(0, league.slots_D - 1);
  if (activeRoles.includes("C")) requirements.C = Math.max(0, league.slots_C - 1);
  if (activeRoles.includes("A")) requirements.A = Math.max(0, league.slots_A - 1);
  return requirements;
};

const countCoveredSlots = (leagueId: number, userId: string): SlotRequirements => {
  const covered: SlotRequirements = { P: 0, D: 0, C: 0, A: 0 };
  const assignmentsStmt = db.prepare(`SELECT p.role, COUNT(pa.player_id) as count FROM player_assignments pa JOIN players p ON pa.player_id = p.id WHERE pa.auction_league_id = ? AND pa.user_id = ? GROUP BY p.role`);
  const assignments = assignmentsStmt.all(leagueId, userId) as { role: string; count: number; }[];
  for (const assign of assignments) { if (assign.role in covered) covered[assign.role as keyof SlotRequirements] += assign.count; }
  const activeWinningBidsStmt = db.prepare(`SELECT p.role, COUNT(DISTINCT a.player_id) as count FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND a.status = 'active' GROUP BY p.role`);
  const winningBids = activeWinningBidsStmt.all(leagueId, userId) as { role: string; count: number; }[];
  for (const bid of winningBids) { if (bid.role in covered) covered[bid.role as keyof SlotRequirements] += bid.count; }
  return covered;
};

const checkUserCompliance = (requiredSlotsNMinusOne: SlotRequirements, coveredSlots: SlotRequirements, activeRolesString: string | null): boolean => {
  if (!activeRolesString || activeRolesString.toUpperCase() === "NONE") return true;
  const activeRoles = activeRolesString.toUpperCase() === "ALL" ? ["P", "D", "C", "A"] : activeRolesString.split(",").map((r) => r.trim().toUpperCase());
  for (const role of activeRoles) {
    const key = role as keyof SlotRequirements;
    if (coveredSlots[key] < requiredSlotsNMinusOne[key]) return false;
  }
  return true;
};

// 5. Funzione Principale Esportata del Servizio Penalità
// Nel file src/lib/db/services/penalty.service.ts
// Sostituisci la funzione processUserComplianceAndPenalties esistente

export const processUserComplianceAndPenalties = async (
  leagueId: number,
  userId: string
): Promise<{
  appliedPenaltyAmount: number;
  isNowCompliant: boolean;
  message: string;
  gracePeriodEndTime?: number;
  timeRemainingSeconds?: number;
}> => {
  let appliedPenaltyAmount = 0;
  let finalMessage = "Compliance check processed.";
  let isNowCompliant = false; // <-- CORREZIONE: Inizializzata a false

  try {
    const transactionResult = db.transaction(() => {
      const now = Math.floor(Date.now() / 1000);
      const leagueStmt = db.prepare("SELECT id, status, active_auction_roles, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?");
      const league = leagueStmt.get(leagueId) as Pick<AuctionLeague, "id" | "status" | "active_auction_roles" | "slots_P" | "slots_D" | "slots_C" | "slots_A"> | undefined;

      if (!league || !["draft_active", "repair_active"].includes(league.status)) {
        finalMessage = `League ${leagueId} not found or not in an active penalty phase.`;
        return { wasModified: false };
      }

      const phaseIdentifier = getCurrentPhaseIdentifier(league.status, league.active_auction_roles);
      const getComplianceStmt = db.prepare("SELECT * FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?");
      let complianceRecord = getComplianceStmt.get(leagueId, userId, phaseIdentifier) as UserLeagueComplianceStatus | undefined;

      if (!complianceRecord) {
        db.prepare(`INSERT INTO user_league_compliance_status (league_id, user_id, phase_identifier, compliance_timer_start_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(leagueId, userId, phaseIdentifier, now, now, now);
        complianceRecord = getComplianceStmt.get(leagueId, userId, phaseIdentifier) as UserLeagueComplianceStatus;
      }

      const requiredSlots = calculateRequiredSlotsMinusOne(league);
      const coveredSlots = countCoveredSlots(leagueId, userId);


      isNowCompliant = checkUserCompliance(requiredSlots, coveredSlots, league.active_auction_roles); // <-- CORREZIONE: Assegnazione alla variabile esterna

      if (!isNowCompliant) {
        let timerToUse = complianceRecord.compliance_timer_start_at;
        if (timerToUse === null) {
          timerToUse = now;
          db.prepare("UPDATE user_league_compliance_status SET compliance_timer_start_at = ?, penalties_applied_this_cycle = 0, last_penalty_applied_for_hour_ending_at = NULL, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?").run(now, now, leagueId, userId, phaseIdentifier);
        }

        const gracePeriodEndTime = timerToUse + COMPLIANCE_GRACE_PERIOD_HOURS * 3600;
        if (now >= gracePeriodEndTime) {
          const refTime = complianceRecord.last_penalty_applied_for_hour_ending_at || gracePeriodEndTime;
          const hoursSince = Math.floor((now - refTime) / 3600);
          const penaltiesToApply = Math.min(hoursSince, MAX_PENALTIES_PER_CYCLE - (complianceRecord.penalties_applied_this_cycle || 0));

          if (penaltiesToApply > 0) {
            for (let i = 0; i < penaltiesToApply; i++) {
              db.prepare("UPDATE league_participants SET current_budget = current_budget - ? WHERE league_id = ? AND user_id = ?").run(PENALTY_AMOUNT, leagueId, userId);
              appliedPenaltyAmount += PENALTY_AMOUNT;
              const newBalance = (db.prepare("SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?").get(leagueId, userId) as { current_budget: number }).current_budget;
              const penaltyDescription = `Penalità per mancato rispetto requisiti rosa (Ora ${ (complianceRecord.penalties_applied_this_cycle || 0) + i + 1}/${MAX_PENALTIES_PER_CYCLE}).`;
              db.prepare(`INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, description, balance_after_in_league, transaction_time) VALUES (?, ?, 'penalty_requirement', ?, ?, ?, ?)`).run(leagueId, userId, PENALTY_AMOUNT, penaltyDescription, newBalance, now);
            }
            db.prepare("UPDATE user_league_compliance_status SET last_penalty_applied_for_hour_ending_at = ?, penalties_applied_this_cycle = penalties_applied_this_cycle + ?, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?").run(now, penaltiesToApply, now, leagueId, userId, phaseIdentifier);
            finalMessage = `Applied ${appliedPenaltyAmount} credits in penalties.`;
          }
        } else {
          finalMessage = `User is non-compliant, but within grace period.`;
        }
      } else {
        if (complianceRecord.compliance_timer_start_at !== null) {
          db.prepare("UPDATE user_league_compliance_status SET compliance_timer_start_at = NULL, last_penalty_applied_for_hour_ending_at = NULL, penalties_applied_this_cycle = 0, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?").run(now, leagueId, userId, phaseIdentifier);
          finalMessage = `User is now compliant. Penalty cycle reset.`;
        } else {
          finalMessage = `User is compliant. No action needed.`;
        }
      }
      return { wasModified: true };
    })();

    if (appliedPenaltyAmount > 0) {
      await notifySocketServer({
        room: `user-${userId}`,
        event: 'penalty-applied-notification',
        data: {
          amount: appliedPenaltyAmount,
          reason: 'Mancato rispetto dei requisiti minimi di composizione della rosa.'
        }
      });
    }
    
    // Calculate timing information for non-compliant users
    let gracePeriodEndTime: number | undefined;
    let timeRemainingSeconds: number | undefined;
    
    if (!isNowCompliant) {
      const complianceRecord = db.prepare("SELECT compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?")
        .get(leagueId, userId, getCurrentPhaseIdentifier(
          (db.prepare("SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?").get(leagueId) as {status: string; active_auction_roles: string} | undefined)?.status || "draft_active",
          (db.prepare("SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?").get(leagueId) as {status: string; active_auction_roles: string} | undefined)?.active_auction_roles || null
        )) as { compliance_timer_start_at: number | null } | undefined;
      
      if (complianceRecord?.compliance_timer_start_at) {
        gracePeriodEndTime = complianceRecord.compliance_timer_start_at + COMPLIANCE_GRACE_PERIOD_HOURS * 3600;
        const now = Math.floor(Date.now() / 1000);
        timeRemainingSeconds = Math.max(0, gracePeriodEndTime - now);
      }
    }
    
    return { 
      appliedPenaltyAmount, 
      isNowCompliant, 
      message: finalMessage,
      gracePeriodEndTime,
      timeRemainingSeconds
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error processing compliance.";
    console.error(`[SERVICE PENALTY] Critical error for user ${userId}, league ${leagueId}: ${errorMessage}`, error);
    throw new Error(`Failed to process user compliance and penalties: ${errorMessage}`);
  }
};