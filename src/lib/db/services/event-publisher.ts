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

// --- B1: contratti realtime dell'asta ---

export interface PublicAuctionUpdatePayload {
  playerId: number;
  newPrice: number;
  highestBidderId: string | null;
  highestBidderName?: string | null;
  scheduledEndTime: number;
  action?: string;
  autoBidCount?: number;
  newBid?: unknown;
}

export interface PrivateAuctionUpdatePayload {
  leagueId: number;
  playerId: number;
  currentBudget: number;
  lockedCredits: number;
  autoBid?: { maxAmount: number; isActive: boolean };
}

/**
 * Evento pubblico `auction-update` sulla stanza `league-${leagueId}`.
 * SOLO dati d'asta condivisibili: mai budget/locked credits/auto-bid personali.
 */
export function publishAuctionUpdate(
  executor: OutboxExecutor,
  leagueId: number,
  payload: PublicAuctionUpdatePayload,
): Promise<void> {
  return enqueueOutboxEvent(executor, {
    eventType: "auction-update",
    room: `league-${leagueId}`,
    eventName: "auction-update",
    payload,
    essential: true,
  });
}

/**
 * Evento privato `user-auction-private-update` sulla stanza `user-${userId}`.
 * Dati finanziari personali (budget, locked credits, massimale auto-bid).
 */
export function publishPrivateAuctionUpdate(
  executor: OutboxExecutor,
  userId: string,
  payload: PrivateAuctionUpdatePayload,
): Promise<void> {
  return enqueueOutboxEvent(executor, {
    eventType: "user-auction-private-update",
    room: `user-${userId}`,
    eventName: "user-auction-private-update",
    payload,
    essential: true,
  });
}
