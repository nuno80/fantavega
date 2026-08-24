import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";
import {
  acquireSchedulerLease,
  releaseSchedulerLease,
} from "./db/services/scheduler-lease.service";
import { reconcileLockedCreditsForActiveLeagues } from "./db/services/locked-credits.service";
import { reapGhostSessions } from "./db/services/session.service";

const TASK_CHECK_INTERVAL = 15 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const runBackgroundTasks = async () => {
  if (isRunning) return;
  isRunning = true;
  let lease: Awaited<ReturnType<typeof acquireSchedulerLease>> = null;
  try {
    lease = await acquireSchedulerLease();
    if (!lease) return;

    await reapGhostSessions();
    await processExpiredAuctionsAndAssignPlayers();
    await processExpiredResponseTimers();
    await processExpiredComplianceTimers();
    await reconcileLockedCreditsForActiveLeagues();
  } catch (error) {
    console.error("[SCHEDULER] Background task failure:", error);
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
