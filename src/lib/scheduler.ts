// src/lib/scheduler.ts
/**
 * Sistema di scheduling automatico per processare timer scaduti
 */
import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
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
      // Process response timers
      console.log("[SCHEDULER] Processing expired timers...");
      const timerResult = await processExpiredResponseTimers();

      if (timerResult.processedCount > 0 || timerResult.errors.length > 0) {
        console.log(
          `[SCHEDULER] Processed ${timerResult.processedCount} expired timers, ${timerResult.errors.length} errors`
        );

        if (timerResult.errors.length > 0) {
          console.error("[SCHEDULER] Timer errors:", timerResult.errors);
        }
      }

      // Process expired auctions
      console.log("[SCHEDULER] Processing expired auctions...");
      const auctionResult = await processExpiredAuctionsAndAssignPlayers();

      if (auctionResult.processedCount > 0 || auctionResult.errors.length > 0) {
        console.log(
          `[SCHEDULER] Processed ${auctionResult.processedCount} expired auctions, ${auctionResult.errors.length} errors`
        );

        if (auctionResult.errors.length > 0) {
          console.error("[SCHEDULER] Auction errors:", auctionResult.errors);
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
