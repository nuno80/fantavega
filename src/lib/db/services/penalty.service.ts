// src/lib/db/services/penalty.service.ts v.2.0 (Async Turso Migration)
// Servizio per la logica di business relativa al sistema di penalità, con notifiche real-time.
// 1. Importazioni
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";

// <-- NUOVA IMPORTAZIONE
import type { AuctionLeague } from "./auction-league.service";

// 2. Tipi e Interfacce
interface UserLeagueComplianceStatus {
  league_id: number;
  user_id: string;
  phase_identifier: string;
  compliance_timer_start_at: number | null;
  last_penalty_applied_for_hour_ending_at: number | null;
  penalties_applied_this_cycle: number;
}

export interface ComplianceRecord {
  user_id: string; // Changed from number to string to match user_id type
  compliance_timer_start_at: number | null; // Changed from string to number | null to match DB type
}

interface SlotRequirements {
  P: number;
  D: number;
  C: number;
  A: number;
}

// 3. Costanti
const PENALTY_AMOUNT = 5;
const MAX_PENALTIES_PER_CYCLE = 5;
const MAX_TOTAL_PENALTY_CREDITS = 25; // Limite assoluto massimo di penalità per utente
const COMPLIANCE_GRACE_PERIOD_HOURS = 1;

// 4. Funzioni Helper (interne)
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
  )
    return requirements;
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

const countCoveredSlots = async (
  leagueId: number,
  userId: string
): Promise<SlotRequirements> => {
  const covered: SlotRequirements = { P: 0, D: 0, C: 0, A: 0 };
  const assignmentsResult = await db.execute({
    sql: `SELECT p.role, COUNT(pa.player_id) as count FROM player_assignments pa JOIN players p ON pa.player_id = p.id WHERE pa.auction_league_id = ? AND pa.user_id = ? GROUP BY p.role`,
    args: [leagueId, userId],
  });
  const assignments = assignmentsResult.rows as unknown as {
    role: string;
    count: number;
  }[];
  for (const assign of assignments) {
    if (assign.role in covered)
      covered[assign.role as keyof SlotRequirements] += Number(assign.count);
  }
  const activeWinningBidsResult = await db.execute({
    sql: `SELECT p.role, COUNT(DISTINCT a.player_id) as count FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ? AND a.status = 'active' GROUP BY p.role`,
    args: [leagueId, userId],
  });
  const winningBids = activeWinningBidsResult.rows as unknown as {
    role: string;
    count: number;
  }[];
  for (const bid of winningBids) {
    if (bid.role in covered)
      covered[bid.role as keyof SlotRequirements] += Number(bid.count);
  }
  return covered;
};

const checkUserCompliance = (
  requiredSlotsNMinusOne: SlotRequirements,
  coveredSlots: SlotRequirements,
  activeRolesString: string | null
): boolean => {
  if (!activeRolesString || activeRolesString.toUpperCase() === "NONE")
    return true;
  const activeRoles =
    activeRolesString.toUpperCase() === "ALL"
      ? ["P", "D", "C", "A"]
      : activeRolesString.split(",").map((r) => r.trim().toUpperCase());
  for (const role of activeRoles) {
    const key = role as keyof SlotRequirements;
    if (coveredSlots[key] < requiredSlotsNMinusOne[key]) return false;
  }
  return true;
};

export const checkAndRecordCompliance = async (
  userId: string,
  leagueId: number
): Promise<{ statusChanged: boolean; isCompliant: boolean }> => {
  try {
    // Rimosso db.transaction() per evitare transazioni annidate
    const now = Math.floor(Date.now() / 1000);

    const _result = await db.execute({
      sql: "SELECT id, status, active_auction_roles, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = _result.rows[0] as unknown as
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

    if (
      !league ||
      !["draft_active", "repair_active"].includes(league.status)
    ) {
      // Not a phase where penalties apply, so no status change.
      return { statusChanged: false, isCompliant: true };
    }

    const phaseIdentifier = getCurrentPhaseIdentifier(
      league.status,
      league.active_auction_roles
    );

    const requiredSlots = calculateRequiredSlotsMinusOne(league);
    const coveredSlots = await countCoveredSlots(leagueId, userId);
    const isCompliant = checkUserCompliance(
      requiredSlots,
      coveredSlots,
      league.active_auction_roles
    );

    const getComplianceResult = await db.execute({
      sql: "SELECT compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
      args: [leagueId, userId, phaseIdentifier],
    });
    let complianceRecord = getComplianceResult.rows[0] as unknown as
      | { compliance_timer_start_at: number | null }
      | undefined;

    // If no record exists, create a placeholder. The logic below will handle it.
    if (!complianceRecord) {
      await db.execute({
        sql: `INSERT INTO user_league_compliance_status (league_id, user_id, phase_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        args: [leagueId, userId, phaseIdentifier, now, now],
      });
      complianceRecord = { compliance_timer_start_at: null };
    }

    const wasTimerActive = complianceRecord.compliance_timer_start_at !== null;
    let statusChanged = false;

    if (isCompliant && wasTimerActive) {
      // CASE A: User became compliant, stop the timer.
      await db.execute({
        sql: "UPDATE user_league_compliance_status SET compliance_timer_start_at = NULL, last_penalty_applied_for_hour_ending_at = NULL, penalties_applied_this_cycle = 0, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
        args: [now, leagueId, userId, phaseIdentifier],
      });
      statusChanged = true;
      console.log(
        `[PENALTY_SERVICE] User ${userId} is now compliant. Timer stopped.`
      );
    } else if (!isCompliant && !wasTimerActive) {
      // CASE B: User became non-compliant, start the timer.
      await db.execute({
        sql: "UPDATE user_league_compliance_status SET compliance_timer_start_at = ?, penalties_applied_this_cycle = 0, last_penalty_applied_for_hour_ending_at = NULL, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
        args: [now, now, leagueId, userId, phaseIdentifier],
      });
      statusChanged = true;
      console.log(
        `[PENALTY_SERVICE] User ${userId} is now non-compliant. Timer started.`
      );
    }

    // If the compliance status changed, notify all users in the league
    if (statusChanged) {
      // Import notifySocketServer function
      import("../../socket-emitter")
        .then(({ notifySocketServer }) => {
          notifySocketServer({
            room: `league-${leagueId}`,
            event: "compliance-status-changed",
            data: {
              userId,
              isCompliant,
              timestamp: now,
            },
          }).catch((error: unknown) => {
            console.error("Failed to notify compliance status change:", error);
          });
        })
        .catch((error: unknown) => {
          console.error("Failed to import socket emitter:", error);
        });
    }

    return { statusChanged, isCompliant };
  } catch (error) {
    console.error(`[PENALTY_SERVICE] Error checking compliance for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Retrieves compliance status for all users in a league for the current phase.
 */
export const getAllComplianceStatus = async (
  leagueId: number
): Promise<ComplianceRecord[]> => {
  try {
    // Get the current phase identifier for the league
    const leagueInfoResult = await db.execute({
      sql: "SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const leagueInfo = leagueInfoResult.rows[0] as unknown as { status: string; active_auction_roles: string | null } | undefined;

    if (!leagueInfo) {
      throw new Error("League not found");
    }

    // Construct the phase identifier
    const phaseIdentifier = getCurrentPhaseIdentifier(
      leagueInfo.status,
      leagueInfo.active_auction_roles
    );

    console.log(`[PENALTY_SERVICE] getAllComplianceStatus - Using phase_identifier: ${phaseIdentifier} for league ${leagueId}`);

    // Get compliance data for all users in the league with the specific phase identifier
    // Use a subquery to get only the most recent record for each user based on updated_at timestamp
    const complianceDataResult = await db.execute({
      sql: `SELECT t1.user_id, t1.compliance_timer_start_at
         FROM user_league_compliance_status t1
         INNER JOIN (
           SELECT user_id, MAX(updated_at) as max_updated_at
           FROM user_league_compliance_status
           WHERE league_id = ? AND phase_identifier = ?
           GROUP BY user_id
         ) t2 ON t1.user_id = t2.user_id AND t1.updated_at = t2.max_updated_at
         WHERE t1.league_id = ? AND t1.phase_identifier = ?`,
      args: [leagueId, phaseIdentifier, leagueId, phaseIdentifier],
    });
    const complianceData = complianceDataResult.rows as unknown as ComplianceRecord[];

    console.log(`[PENALTY_SERVICE] Found ${complianceData.length} compliance records for league ${leagueId}`);

    return complianceData;
  } catch (error) {
    console.error("[PENALTY_SERVICE] Error in getAllComplianceStatus:", error);
    throw error;
  }
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
  totalPenaltyAmount: number; // <-- Aggiunto
}> => {
  let appliedPenaltyAmount = 0;
  let finalMessage = "Compliance check processed.";
  let isNowCompliant = false;

  try {
    const tx = await db.transaction("write");
    let _result;

    try {
      // --- INIZIO MODIFICA ---
      // Controlla se l'utente ha mai effettuato un login prima di procedere
      const sessionCheckResult = await tx.execute({
        sql: "SELECT 1 FROM user_sessions WHERE user_id = ? LIMIT 1",
        args: [userId],
      });
      const hasLoggedIn = sessionCheckResult.rows.length > 0;

      if (!hasLoggedIn) {
        finalMessage = `User ${userId} has never logged in. Penalty check skipped.`;
        // Restituiamo uno stato di conformità per evitare che l'icona P appaia
        isNowCompliant = true;
        appliedPenaltyAmount = 0;
        await tx.commit();
        return {
          appliedPenaltyAmount,
          isNowCompliant,
          message: finalMessage,
          totalPenaltyAmount: 0,
        };
      }
      // --- FINE MODIFICA ---

      const now = Math.floor(Date.now() / 1000);
      const leagueResult = await tx.execute({
        sql: "SELECT id, status, active_auction_roles, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?",
        args: [leagueId],
      });
      const league = leagueResult.rows[0] as unknown as
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

      if (
        !league ||
        !["draft_active", "repair_active"].includes(league.status)
      ) {
        finalMessage = `League ${leagueId} not found or not in an active penalty phase.`;
        await tx.commit();
        return {
          appliedPenaltyAmount: 0,
          isNowCompliant: true,
          message: finalMessage,
          totalPenaltyAmount: 0,
        };
      }

      const phaseIdentifier = getCurrentPhaseIdentifier(
        league.status,
        league.active_auction_roles
      );
      const getComplianceResult = await tx.execute({
        sql: "SELECT * FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
        args: [leagueId, userId, phaseIdentifier],
      });
      let complianceRecord = getComplianceResult.rows[0] as unknown as
        | UserLeagueComplianceStatus
        | undefined;

      if (!complianceRecord) {
        await tx.execute({
          sql: `INSERT INTO user_league_compliance_status (league_id, user_id, phase_identifier, compliance_timer_start_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [leagueId, userId, phaseIdentifier, now, now, now],
        });
        const newRecordResult = await tx.execute({
          sql: "SELECT * FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
          args: [leagueId, userId, phaseIdentifier],
        });
        complianceRecord = newRecordResult.rows[0] as unknown as UserLeagueComplianceStatus;
      }
      const requiredSlots = calculateRequiredSlotsMinusOne(league);
      const coveredSlots = await countCoveredSlots(leagueId, userId);

      isNowCompliant = checkUserCompliance(
        requiredSlots,
        coveredSlots,
        league.active_auction_roles
      );

      if (!isNowCompliant) {
        let timerToUse = complianceRecord.compliance_timer_start_at;
        if (timerToUse === null) {
          timerToUse = now;
          await tx.execute({
            sql: "UPDATE user_league_compliance_status SET compliance_timer_start_at = ?, penalties_applied_this_cycle = 0, last_penalty_applied_for_hour_ending_at = NULL, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
            args: [now, now, leagueId, userId, phaseIdentifier],
          });
        }

        const gracePeriodEndTime =
          timerToUse + COMPLIANCE_GRACE_PERIOD_HOURS * 3600;
        if (now >= gracePeriodEndTime) {
          // Controllo del limite massimo assoluto di penalità
          const currentTotalPenaltiesResult = await tx.execute({
            sql: "SELECT COALESCE(SUM(amount), 0) as current_total FROM budget_transactions WHERE auction_league_id = ? AND user_id = ? AND transaction_type = 'penalty_requirement'",
            args: [leagueId, userId],
          });
          const currentTotalPenalties = Number(
            currentTotalPenaltiesResult.rows[0].current_total
          );

          if (currentTotalPenalties >= MAX_TOTAL_PENALTY_CREDITS) {
            finalMessage = `User has reached maximum penalty limit of ${MAX_TOTAL_PENALTY_CREDITS} credits. No additional penalties applied.`;
          } else {
            const refTime =
              complianceRecord.last_penalty_applied_for_hour_ending_at ||
              gracePeriodEndTime;

            // BUGFIX: Previously Math.floor((now - refTime) / 3600)
            // This meant 0-59 mins after grace period = 0 penalties.
            // We want 0-59 mins after grace period = 1 penalty (for that started hour).
            // Logic:
            // If now >= refTime, at least 1 penalty block has started.
            // If it's the first penalty ever (last_penalty... is null), refTime is graceEnd.
            //    now = graceEnd + 1s. diff = 1. floor(1/3600) = 0. We want 1.
            // If it's subsequent (last_penalty... is graceEnd + 3600).
            //    now = graceEnd + 3601s. refTime = graceEnd + 3600. diff = 1. We want 1 more.
            // Formula: Math.floor((now - refTime) / 3600) + 1
            const diffSeconds = now - refTime;
            const hoursSince = diffSeconds >= 0 ? Math.floor(diffSeconds / 3600) + 1 : 0;

            // Calcola quante penalità possono essere applicate rispettando sia il limite del ciclo che il limite assoluto
            const remainingPenaltiesInCycle =
              MAX_PENALTIES_PER_CYCLE -
              (complianceRecord.penalties_applied_this_cycle || 0);
            const remainingCreditsFromLimit =
              MAX_TOTAL_PENALTY_CREDITS - currentTotalPenalties;
            const maxPenaltiesFromLimit = Math.floor(
              remainingCreditsFromLimit / PENALTY_AMOUNT
            );

            const penaltiesToApply = Math.min(
              hoursSince,
              remainingPenaltiesInCycle,
              maxPenaltiesFromLimit
            );

            if (penaltiesToApply > 0) {
              for (let i = 0; i < penaltiesToApply; i++) {
                await tx.execute({
                  sql: "UPDATE league_participants SET current_budget = current_budget - ? WHERE league_id = ? AND user_id = ?",
                  args: [PENALTY_AMOUNT, leagueId, userId],
                });
                appliedPenaltyAmount += PENALTY_AMOUNT;
                const newBalanceResult = await tx.execute({
                  sql: "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?",
                  args: [leagueId, userId],
                });
                const newBalance = Number(
                  newBalanceResult.rows[0].current_budget
                );
                const penaltyDescription = `Penalità per mancato rispetto requisiti rosa (Ora ${(complianceRecord.penalties_applied_this_cycle || 0) + i + 1
                  }/${MAX_PENALTIES_PER_CYCLE}).`;
                await tx.execute({
                  sql: `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, description, balance_after_in_league, transaction_time) VALUES (?, ?, 'penalty_requirement', ?, ?, ?, ?)`,
                  args: [
                    leagueId,
                    userId,
                    PENALTY_AMOUNT,
                    penaltyDescription,
                    newBalance,
                    now,
                  ],
                });
              }
              await tx.execute({
                sql: "UPDATE user_league_compliance_status SET last_penalty_applied_for_hour_ending_at = ?, penalties_applied_this_cycle = penalties_applied_this_cycle + ?, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
                args: [
                  // New reference time: reset to the end of the covered period.
                  // If we applied N penalties, we cover N hours from the OLD refTime.
                  // refTime is what we calculated hoursSince from.
                  refTime + (penaltiesToApply * 3600),
                  penaltiesToApply,
                  now,
                  leagueId,
                  userId,
                  phaseIdentifier,
                ],
              });
              finalMessage = `Applied ${appliedPenaltyAmount} credits in penalties.`;
            } else if (currentTotalPenalties < MAX_TOTAL_PENALTY_CREDITS) {
              finalMessage = `User is non-compliant, but no penalties due this hour.`;
            }
          }
        } else {
          finalMessage = `User is non-compliant, but within grace period.`;
        }
      } else {
        if (complianceRecord.compliance_timer_start_at !== null) {
          await tx.execute({
            sql: "UPDATE user_league_compliance_status SET compliance_timer_start_at = NULL, last_penalty_applied_for_hour_ending_at = NULL, penalties_applied_this_cycle = 0, updated_at = ? WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
            args: [now, leagueId, userId, phaseIdentifier],
          });
          finalMessage = `User is now compliant. Penalty cycle reset.`;
        } else {
          finalMessage = `User is compliant. No action needed.`;
        }
      }

      await tx.commit();
      // result = { wasModified: true };
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    if (appliedPenaltyAmount > 0) {
      await notifySocketServer({
        room: `user-${userId}`,
        event: "penalty-applied-notification",
        data: {
          amount: appliedPenaltyAmount,
          reason:
            "Mancato rispetto dei requisiti minimi di composizione della rosa.",
        },
      });
    }

    // Notify all users in the league about the compliance status change
    // ONLY if a penalty was applied OR the user became compliant.
    // This prevents infinite loops when the scheduler checks non-compliant users who are just waiting for the next penalty.
    if (appliedPenaltyAmount > 0 || isNowCompliant) {
      await notifySocketServer({
        room: `league-${leagueId}`,
        event: "compliance-status-changed",
        data: {
          userId,
          isCompliant: isNowCompliant,
          appliedPenaltyAmount,
          timestamp: Math.floor(Date.now() / 1000),
        },
      });
    }

    // Calculate timing information for non-compliant users
    let gracePeriodEndTime: number | undefined;
    let timeRemainingSeconds: number | undefined;

    if (!isNowCompliant) {
      const leagueInfoResult = await db.execute({
        sql: "SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?",
        args: [leagueId],
      });
      const leagueInfo = leagueInfoResult.rows[0] as unknown as
        | { status: string; active_auction_roles: string }
        | undefined;

      const phaseId = getCurrentPhaseIdentifier(
        leagueInfo?.status || "draft_active",
        leagueInfo?.active_auction_roles || null
      );

      const complianceRecordResult = await db.execute({
        sql: "SELECT compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ? AND user_id = ? AND phase_identifier = ?",
        args: [leagueId, userId, phaseId],
      });
      const complianceRecord = complianceRecordResult.rows[0] as unknown as
        | { compliance_timer_start_at: number | null }
        | undefined;

      if (complianceRecord?.compliance_timer_start_at) {
        gracePeriodEndTime =
          complianceRecord.compliance_timer_start_at +
          COMPLIANCE_GRACE_PERIOD_HOURS * 3600;
        const now = Math.floor(Date.now() / 1000);
        timeRemainingSeconds = Math.max(0, gracePeriodEndTime - now);
      }
    }

    // Calculate total historical penalties for this user in this league
    const totalPenaltiesResult = await db.execute({
      sql: "SELECT COALESCE(SUM(amount), 0) as total_penalties FROM budget_transactions WHERE auction_league_id = ? AND user_id = ? AND transaction_type = 'penalty_requirement'",
      args: [leagueId, userId],
    });
    const totalPenaltyAmount = Number(
      totalPenaltiesResult.rows[0].total_penalties
    );

    return {
      appliedPenaltyAmount,
      totalPenaltyAmount,
      isNowCompliant,
      message: finalMessage,
      gracePeriodEndTime,
      timeRemainingSeconds,
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

// NUOVA FUNZIONE: Processa i timer di compliance scaduti per tutti gli utenti
export const processExpiredComplianceTimers = async (): Promise<{
  processedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  const errors: string[] = [];

  try {
    console.log(
      `[COMPLIANCE_SERVICE] Processing expired compliance timers at ${now}`
    );

    // Trova tutti i timer di compliance scaduti
    // Un timer è scaduto se:
    // 1. compliance_timer_start_at non è null (timer attivo)
    // 2. La grace period è terminata (compliance_timer_start_at + 3600 <= now)
    const expiredTimersResult = await db.execute({
      sql: `
        SELECT ulcs.league_id, ulcs.user_id, ulcs.phase_identifier,
               ulcs.compliance_timer_start_at, ulcs.last_penalty_applied_for_hour_ending_at,
               ulcs.penalties_applied_this_cycle, al.status, al.active_auction_roles
        FROM user_league_compliance_status ulcs
        JOIN auction_leagues al ON ulcs.league_id = al.id
        WHERE ulcs.compliance_timer_start_at IS NOT NULL
          AND ulcs.compliance_timer_start_at + 3600 <= ?
          AND al.status IN ('draft_active', 'repair_active')
        `,
      args: [now],
    });
    const expiredTimers = expiredTimersResult.rows as unknown as Array<{
      league_id: number;
      user_id: string;
      phase_identifier: string;
      compliance_timer_start_at: number;
      last_penalty_applied_for_hour_ending_at: number | null;
      penalties_applied_this_cycle: number;
      status: string;
      active_auction_roles: string | null;
    }>;

    console.log(
      `[COMPLIANCE_SERVICE] Found ${expiredTimers.length} expired compliance timers`
    );

    // Processa ogni timer scaduto
    for (const timer of expiredTimers) {
      try {
        console.log(
          `[COMPLIANCE_SERVICE] Processing expired timer for user ${timer.user_id} in league ${timer.league_id}`
        );

        // Chiama la funzione esistente per applicare le penalità
        const result = await processUserComplianceAndPenalties(
          timer.league_id,
          timer.user_id
        );

        console.log(
          `[COMPLIANCE_SERVICE] Processed compliance timer for user ${timer.user_id} in league ${timer.league_id}. Applied penalty: ${result.appliedPenaltyAmount} credits`
        );

        if (result.appliedPenaltyAmount > 0) {
          // Notifica via Socket.IO se è stata applicata una penalità
          await notifySocketServer({
            room: `user-${timer.user_id}`,
            event: "penalty-applied-notification",
            data: {
              amount: result.appliedPenaltyAmount,
              reason:
                "Mancato rispetto dei requisiti minimi di composizione della rosa.",
            },
          });
        }

        processedCount++;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        errors.push(
          `User ${timer.user_id}, League ${timer.league_id}: ${errorMsg}`
        );
        console.error(
          `[COMPLIANCE_SERVICE] Error processing compliance timer for user ${timer.user_id} in league ${timer.league_id}:`,
          error
        );
      }
    }

    console.log(
      `[COMPLIANCE_SERVICE] Completed processing. Processed: ${processedCount}, Errors: ${errors.length}`
    );

    return { processedCount, errors };
  } catch (error) {
    console.error(
      "[COMPLIANCE_SERVICE] Error processing expired compliance timers:",
      error
    );
    throw error;
  }
};
