import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { dispatchOutboxEvents } from "./db/services/event-outbox.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";
import { logger } from "@/lib/logger";

import {
  acquireSchedulerLease,
  releaseSchedulerLease,
  renewSchedulerLease,
  shouldRenewLease,
} from "./db/services/scheduler-lease.service";
import { reconcileLockedCreditsForActiveLeagues } from "./db/services/locked-credits.service";
import { reapGhostSessions } from "./db/services/session.service";

const TASK_CHECK_INTERVAL = 15 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// TIME-002: rinnova il lease prima che scada tra un task sequenziale e l'altro.
// Se il rinnovo fallisce, l'istanza ha perso la ownership (un'altra l'ha
// claimata) e interrompe il ciclo per non lavorare in overlap.
async function renewLeaseIfNeeded(
  lease: { ownerToken: string; expiresAt: number },
): Promise<boolean> {
  if (!shouldRenewLease(lease.expiresAt)) return true;
  const renewal = await renewSchedulerLease(lease.ownerToken);
  if (renewal.renewed) {
    lease.expiresAt = renewal.expiresAt;
    return true;
  }
  logger.warn("scheduler lease renewal failed, aborting cycle", {
    ownerToken: lease.ownerToken.slice(0, 8),
  });
  return false;
}

const runBackgroundTasks = async () => {
  if (isRunning) return;
  isRunning = true;
  let lease: Awaited<ReturnType<typeof acquireSchedulerLease>> = null;
  try {
    lease = await acquireSchedulerLease();
    if (!lease) return;

    await reapGhostSessions();
    if (!(await renewLeaseIfNeeded(lease))) return;

    await processExpiredAuctionsAndAssignPlayers();
    if (!(await renewLeaseIfNeeded(lease))) return;

    await processExpiredResponseTimers();
    if (!(await renewLeaseIfNeeded(lease))) return;

    await processExpiredComplianceTimers();
    if (!(await renewLeaseIfNeeded(lease))) return;

    await reconcileLockedCreditsForActiveLeagues();
    await dispatchOutboxEvents();
  } catch (error) {
    logger.error("background task failure", { error });
  } finally {
    if (lease) await releaseSchedulerLease(lease.ownerToken);
    isRunning = false;
  }
};

export const startScheduler = () => {
  if (schedulerInterval) return;
  void runBackgroundTasks();
  schedulerInterval = setInterval(() => void runBackgroundTasks(), TASK_CHECK_INTERVAL);
};

export const stopScheduler = () => {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
};

export const runManualProcessing = async () => runBackgroundTasks();
