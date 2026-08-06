import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid-expiry";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";
import { reapGhostSessions } from "./db/services/session.service";

const TASK_CHECK_INTERVAL = 15 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const BACKGROUND_TASKS: Array<{ name: string; run: () => Promise<unknown> }> = [
  { name: "reapGhostSessions", run: () => reapGhostSessions() },
  { name: "processExpiredAuctionsAndAssignPlayers", run: () => processExpiredAuctionsAndAssignPlayers() },
  { name: "processExpiredResponseTimers", run: () => processExpiredResponseTimers() },
  { name: "processExpiredComplianceTimers", run: () => processExpiredComplianceTimers() },
];

const runBackgroundTasks = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const results = await Promise.allSettled(BACKGROUND_TASKS.map((t) => t.run()));
    results.forEach((result, index) => {
      const taskName = BACKGROUND_TASKS[index].name;
      if (result.status === "fulfilled") {
        console.log(`[SCHEDULER] ${taskName} completed`);
      } else {
        console.error(`[SCHEDULER] ${taskName} failed:`, result.reason);
      }
    });
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
