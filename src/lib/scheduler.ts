/**
 * Sistema di scheduling automatico per processare timer scaduti
 */
import { processExpiredResponseTimers } from "./db/services/response-timer.service";

const TIMER_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minuti

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Avvia il sistema di scheduling automatico
 */
export const startScheduler = () => {
  if (schedulerInterval) {
    console.log("[SCHEDULER] Already running");
    return;
  }

  console.log(
    "[SCHEDULER] Starting automatic timer processing (every 5 minutes)"
  );

  schedulerInterval = setInterval(async () => {
    try {
      console.log("[SCHEDULER] Processing expired timers...");
      const result = await processExpiredResponseTimers();

      if (result.processedCount > 0 || result.errors.length > 0) {
        console.log(
          `[SCHEDULER] Processed ${result.processedCount} expired timers, ${result.errors.length} errors`
        );

        if (result.errors.length > 0) {
          console.error("[SCHEDULER] Errors:", result.errors);
        }
      }
    } catch (error) {
      console.error("[SCHEDULER] Error processing expired timers:", error);
    }
  }, TIMER_CHECK_INTERVAL);
};

/**
 * Ferma il sistema di scheduling automatico
 */
export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SCHEDULER] Stopped");
  }
};

/**
 * Processa manualmente i timer scaduti (per testing)
 */
export const processTimersManually = async () => {
  console.log("[SCHEDULER] Manual timer processing triggered");
  try {
    const result = await processExpiredResponseTimers();
    console.log(
      `[SCHEDULER] Manual processing completed: ${result.processedCount} processed, ${result.errors.length} errors`
    );
    return result;
  } catch (error) {
    console.error("[SCHEDULER] Manual processing error:", error);
    throw error;
  }
};
