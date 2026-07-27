import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";
import { reapGhostSessions } from "./db/services/session.service";

// Ho impostato 5 secondi come nel tuo branch. Se preferivi i 15 secondi di main, cambialo pure a 15.
const TASK_CHECK_INTERVAL = 5 * 1000;
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const runBackgroundTasks = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    await reapGhostSessions();
    const auctionResult = await processExpiredAuctionsAndAssignPlayers();
    if (auctionResult.processedCount > 0 || auctionResult.failedCount > 0) {
      console.log(`[SCHEDULER] Expired auctions: ${auctionResult.processedCount} successful, ${auctionResult.failedCount} failed`);
    }
    const timerResult = await processExpiredResponseTimers();
    if (timerResult.processedCount > 0 || timerResult.errors.length > 0) {
      console.log(`[SCHEDULER] Expired response timers: ${timerResult.processedCount} processed, ${timerResult.errors.length} errors`);
    }
    const complianceResult = await processExpiredComplianceTimers();
    if (complianceResult.processedCount > 0 || complianceResult.errors.length > 0) {
      console.log(`[SCHEDULER] Compliance timers: ${complianceResult.processedCount} processed, ${complianceResult.errors.length} errors`);
    }
  } catch (error) {
    console.error("[SCHEDULER] Background task failure:", error);
  } finally {
    isRunning = false;
  }
};

export const startScheduler = () => {
  if (schedulerInterval) return;
  // Usiamo la sintassi 'void' di main per evitare warning TypeScript
  void runBackgroundTasks();
  schedulerInterval = setInterval(() => void runBackgroundTasks(), TASK_CHECK_INTERVAL);
};

export const stopScheduler = () => {
  if (!schedulerInterval) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
};

export const runManualProcessing = async () => runBackgroundTasks();