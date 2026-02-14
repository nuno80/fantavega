/**
 * Sistema di scheduling per task periodici come la chiusura di aste
 * e il processamento di timer scaduti.
 *
 * IMPORTANT: Usa un lock di concorrenza per evitare esecuzioni sovrapposte
 * che saturano il limite connessioni di Turso.
 */
import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";

// Intervallo di controllo — 5 secondi è sufficiente per chiusura tempestiva
const TASK_CHECK_INTERVAL = 5 * 1000;

let schedulerInterval: NodeJS.Timeout | null = null;

// Lock di concorrenza: impedisce esecuzioni sovrapposte che saturano le connessioni DB
let isRunning = false;

/**
 * Esegue tutti i task di background necessari.
 * Se una esecuzione precedente è ancora in corso, salta questo tick.
 */
const runBackgroundTasks = async () => {
  // Guard: se il tick precedente è ancora in esecuzione, skip
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    // 1. Processa le aste scadute
    const auctionResult = await processExpiredAuctionsAndAssignPlayers();
    if (auctionResult.processedCount > 0 || auctionResult.failedCount > 0) {
      console.log(
        `[SCHEDULER] Expired auctions processed: ${auctionResult.processedCount} successful, ${auctionResult.failedCount} failed.`
      );
      if (auctionResult.errors.length > 0) {
        console.error(
          "[SCHEDULER] Auction processing errors:",
          auctionResult.errors
        );
      }
    }

    // 2. Processa i timer di risposta scaduti
    const timerResult = await processExpiredResponseTimers();
    if (timerResult.processedCount > 0 || timerResult.errors.length > 0) {
      console.log(
        `[SCHEDULER] Expired response timers processed: ${timerResult.processedCount} successful, ${timerResult.errors.length} errors.`
      );
      if (timerResult.errors.length > 0) {
        console.error(
          "[SCHEDULER] Timer processing errors:",
          timerResult.errors
        );
      }
    }

    // 3. Processa i timer di compliance scaduti
    const complianceResult = await processExpiredComplianceTimers();
    if (complianceResult.processedCount > 0 || complianceResult.errors.length > 0) {
      console.log(
        `[SCHEDULER] Expired compliance timers processed: ${complianceResult.processedCount} successful, ${complianceResult.errors.length} errors.`
      );
      if (complianceResult.errors.length > 0) {
        console.error(
          "[SCHEDULER] Compliance timer processing errors:",
          complianceResult.errors
        );
      }
    }
  } catch (error) {
    console.error(
      "[SCHEDULER] Unhandled error during background task execution:",
      error
    );
  } finally {
    // Rilascia il lock SEMPRE, anche in caso di errore
    isRunning = false;
  }
};

/**
 * Avvia il sistema di scheduling automatico.
 */
export const startScheduler = () => {
  if (schedulerInterval) {
    return;
  }

  console.log(
    `[SCHEDULER] Starting background task processing (every ${TASK_CHECK_INTERVAL / 1000} seconds)`
  );

  // Esegui subito al primo avvio
  runBackgroundTasks();

  // E poi esegui a intervalli regolari
  schedulerInterval = setInterval(runBackgroundTasks, TASK_CHECK_INTERVAL);
};

/**
 * Ferma il sistema di scheduling automatico.
 */
export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[SCHEDULER] Scheduler stopped.");
  }
};

/**
 * Esegue manualmente i task di background (utile per testing o API).
 */
export const runManualProcessing = async () => {
  console.log("[SCHEDULER] Manual processing triggered.");
  await runBackgroundTasks();
  console.log("[SCHEDULER] Manual processing finished.");
};
