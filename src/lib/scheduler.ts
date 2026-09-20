import { logger } from "@/lib/logger";

import { processExpiredAuctionsAndAssignPlayers } from "./db/services/bid.service";
import { dispatchOutboxEvents } from "./db/services/event-outbox.service";
import { reconcileLockedCreditsForActiveLeagues } from "./db/services/locked-credits.service";
import { processExpiredComplianceTimers } from "./db/services/penalty.service";
import { processExpiredResponseTimers } from "./db/services/response-timer.service";
import {
  acquireSchedulerLease,
  releaseSchedulerLease,
  renewSchedulerLease,
  shouldRenewLease,
} from "./db/services/scheduler-lease.service";
import { hasDueBackgroundWork } from "./db/services/scheduler-work.service";
import { reapGhostSessions } from "./db/services/session.service";

const TASK_CHECK_INTERVAL = 15 * 1000;
const GHOST_SESSION_REAP_INTERVAL = 60 * 1000;
const LOCKED_CREDIT_RECONCILE_INTERVAL = 30 * 60 * 1000;
// Keep realtime delivery fast while work exists, then back off when the outbox
// stays empty. This caps idle polling at one query every five seconds without
// changing the durable at-least-once delivery contract.
const OUTBOX_INTERVALS = [1_000, 2_000, 5_000] as const;
let schedulerInterval: NodeJS.Timeout | null = null;
let outboxTimeout: NodeJS.Timeout | null = null;
let isRunning = false;
let isOutboxRunning = false;
let shouldRunOutbox = false;
let consecutiveEmptyOutboxTicks = 0;
let lastGhostSessionReapAt = 0;
let lastLockedCreditReconcileAt = 0;

function isDue(lastRunAt: number, interval: number, now: number): boolean {
  return lastRunAt === 0 || now - lastRunAt >= interval;
}

export function getNextOutboxDelay(
  delivered: number,
  emptyTicks = consecutiveEmptyOutboxTicks
): { delay: number; emptyTicks: number } {
  const nextEmptyTicks = delivered > 0 ? 0 : emptyTicks + 1;
  const intervalIndex = Math.min(nextEmptyTicks, OUTBOX_INTERVALS.length - 1);
  return {
    delay: OUTBOX_INTERVALS[intervalIndex],
    emptyTicks: nextEmptyTicks,
  };
}

// TIME-002: rinnova il lease prima che scada tra un task sequenziale e l'altro.
// Se il rinnovo fallisce, l'istanza ha perso la ownership (un'altra l'ha
// claimata) e interrompe il ciclo per non lavorare in overlap.
async function renewLeaseIfNeeded(lease: {
  ownerToken: string;
  expiresAt: number;
}): Promise<boolean> {
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
    const now = Date.now();
    if (isDue(lastGhostSessionReapAt, GHOST_SESSION_REAP_INTERVAL, now)) {
      // This update is idempotent and already guarded by its WHERE clause, so
      // it does not need the distributed lease and writes only stale sessions.
      lastGhostSessionReapAt = now;
      await reapGhostSessions();
    }

    const shouldReconcileLockedCredits = isDue(
      lastLockedCreditReconcileAt,
      LOCKED_CREDIT_RECONCILE_INTERVAL,
      now
    );
    const hasDueWork = await hasDueBackgroundWork(Math.floor(now / 1000));

    // In idle there is no reason to acquire and immediately release the lease:
    // those two operations were the source of ~11,520 writes/day per replica.
    if (!hasDueWork && !shouldReconcileLockedCredits) return;

    lease = await acquireSchedulerLease();
    if (!lease) return;

    if (hasDueWork) {
      await processExpiredAuctionsAndAssignPlayers();
      if (!(await renewLeaseIfNeeded(lease))) return;

      await processExpiredResponseTimers();
      if (!(await renewLeaseIfNeeded(lease))) return;

      await processExpiredComplianceTimers();
      if (!(await renewLeaseIfNeeded(lease))) return;
    }

    if (shouldReconcileLockedCredits) {
      // Bid, auto-bid and response-timer mutations already recalculate credits
      // transactionally. This remains a slow safety net for drift recovery.
      lastLockedCreditReconcileAt = now;
      await reconcileLockedCreditsForActiveLeagues();
    }
  } catch (error) {
    logger.error("background task failure", { error });
  } finally {
    if (lease) await releaseSchedulerLease(lease.ownerToken);
    isRunning = false;
  }
};

const runOutboxTick = async () => {
  if (isOutboxRunning) return;
  isOutboxRunning = true;
  let delivered = 0;
  try {
    delivered = await dispatchOutboxEvents();
  } catch (error) {
    logger.error("outbox tick failure", { error });
  } finally {
    isOutboxRunning = false;
    if (shouldRunOutbox) {
      const next = getNextOutboxDelay(delivered);
      consecutiveEmptyOutboxTicks = next.emptyTicks;
      scheduleOutboxTick(next.delay);
    }
  }
};

function scheduleOutboxTick(delay: number): void {
  if (!shouldRunOutbox) return;
  outboxTimeout = setTimeout(() => {
    outboxTimeout = null;
    void runOutboxTick();
  }, delay);
}

export const startScheduler = () => {
  if (schedulerInterval) return;
  void runBackgroundTasks();
  schedulerInterval = setInterval(
    () => void runBackgroundTasks(),
    TASK_CHECK_INTERVAL
  );
  if (!shouldRunOutbox) {
    shouldRunOutbox = true;
    consecutiveEmptyOutboxTicks = 0;
    scheduleOutboxTick(0);
  }
};

export const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  shouldRunOutbox = false;
  if (outboxTimeout) {
    clearTimeout(outboxTimeout);
    outboxTimeout = null;
  }
};

export const runManualProcessing = async () => runBackgroundTasks();
