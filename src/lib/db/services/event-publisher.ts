// src/lib/db/services/event-publisher.ts
// REL-006: single seam for realtime delivery. Essential events go to the
// outbox (durable, delivered at-least-once); non-essential events are
// best-effort fire-and-forget. Keeps callers from mixing persistency and
// delivery.
import { logger } from "@/lib/logger";
import { notifySocketServer } from "@/lib/socket-emitter";
import {
  enqueueOutboxEvent,
  type OutboxEventType,
  type OutboxExecutor,
} from "./event-outbox.service";

interface SocketEvent {
  eventType: OutboxEventType;
  room: string;
  eventName: string;
  payload: unknown;
}

/**
 * Enqueue an essential event in the same transaction as the mutation.
 * Call BEFORE commit; the dispatcher delivers it after the commit is durable.
 */
export async function publishEssentialEvent(
  executor: OutboxExecutor,
  event: SocketEvent,
): Promise<void> {
  await enqueueOutboxEvent(executor, { ...event, essential: true });
}

/**
 * Best-effort delivery for non-essential events (e.g. individual
 * notifications). Never blocks the caller and never fails the mutation.
 */
export function publishBestEffortEvent(event: SocketEvent): void {
  notifySocketServer({
    room: event.room,
    event: event.eventName,
    data: event.payload,
  }).catch((error) => {
    logger.warn("best-effort event delivery failed", {
      eventType: event.eventType,
      room: event.room,
      event: event.eventName,
      error,
    });
  });
}

// Re-export for callers that still need a raw client type.
export type { OutboxExecutor };
