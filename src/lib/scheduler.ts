import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";

const TASK_CHECK_INTERVAL = 15 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const runBackgroundTasks = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    await processExpiredAuctionsAndAssignPlayers();
    await processExpiredResponseTimers();
    await processExpiredComplianceTimers();
  } catch (error) {
    console.error("[SCHEDULER] Background task failure:", error);
  } finally {
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
