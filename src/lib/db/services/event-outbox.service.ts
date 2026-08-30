// src/lib/db/services/event-outbox.service.ts
// REL-006: durable event outbox + idempotent dispatcher.
//
// Publisher: enqueue in the SAME transaction as the mutation (pass `tx`).
// Dispatcher: claim a batch with a fencing token, deliver via the socket
// emitter, then delete claimed events. Idempotent: delete is keyed by the
// claim owner token, so two dispatchers can never deliver the same event.
// At-least-once delivery; consumers must be idempotent (clients refetch on
// reconnect, the socket server dedups via shouldEmit).
import { randomUUID } from "node:crypto";

import { type Client } from "@libsql/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifySocketServer } from "@/lib/socket-emitter";

export type OutboxEventType =
  | "auction-update"
  | "user-auction-private-update"
  | "auction-created"
  | "auction-closed"
  | "bid-surpassed-notification"
  | "auto-bid-activated-notification"
  | "compliance-status-changed"
  | "response-timer-started"
  | "timers-activated-notification"
  | "timer-expired-notification"
  | "user-timer-expired"
  | "auction-state-changed"
  | "league-status-changed";

export type Essentiality = "essential" | "non-essential";

export interface OutboxEvent {
  eventType: OutboxEventType;
  room: string;
  eventName: string;
  payload: unknown;
  essential?: boolean;
}

export type OutboxExecutor = Pick<Client, "execute">;

const MAX_ATTEMPTS_ESSENTIAL = 8;
const MAX_ATTEMPTS_NON_ESSENTIAL = 3;

// A claim is considered stale when the owning dispatcher has not finished
// within this window (crash, deploy, timeout). Reclaiming it risks a rare
// double delivery if the original dispatcher is merely slow; consumers are
// idempotent (clients refetch on reconnect, the socket server dedups).
const STALE_CLAIM_SECONDS = 60;
// Reclaim stale claims one at a time to keep the double-delivery window small.
const STALE_CLAIM_BATCH_SIZE = 1;

function retryDelayMs(attempts: number): number {
  // 150ms base, exponential backoff, capped at ~60s.
  return Math.min(150 * 2 ** attempts, 60_000);
}

/**
 * Enqueues an event into the outbox using the given executor.
 * Pass the open transaction `tx` to make delivery durable with the mutation;
 * pass `db` for best-effort enqueues outside a transaction.
 */
export async function enqueueOutboxEvent(
  executor: OutboxExecutor,
  event: OutboxEvent,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await executor.execute({
    sql: `INSERT INTO event_outbox
          (event_id, event_type, room, event_name, payload, essential, status, attempts, next_attempt_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    args: [
      randomUUID(),
      event.eventType,
      event.room,
      event.eventName,
      JSON.stringify(event.payload ?? null),
      event.essential === false ? 0 : 1,
      now,
      now,
    ],
  });
}

/**
 * Claims up to `limit` due pending events with a fencing token, then attempts
 * delivery. Returns the number of events delivered successfully.
 * Idempotent: deleting is conditional on the owner token, so an overlapping
 * dispatcher cannot redeliver the same event.
 */
export async function dispatchOutboxEvents(limit = 50): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = randomUUID();

  const claim = await db.execute({
    sql: `UPDATE event_outbox
          SET status = 'pending', claimed_at = ?, owner_token = ?
          WHERE id IN (
            SELECT id FROM event_outbox
            WHERE status = 'pending' AND next_attempt_at <= ?
              AND (claimed_at IS NULL OR claimed_at < ?)
            ORDER BY CASE WHEN claimed_at IS NULL THEN 0 ELSE 1 END, id ASC
            LIMIT CASE WHEN EXISTS (
              SELECT 1 FROM event_outbox
              WHERE status = 'pending' AND claimed_at IS NOT NULL AND claimed_at < ?
            ) THEN ? ELSE ? END
          )
          RETURNING id, event_type, room, event_name, payload, essential, attempts`,
    args: [now, ownerToken, now, now - STALE_CLAIM_SECONDS, now - STALE_CLAIM_SECONDS, STALE_CLAIM_BATCH_SIZE, limit],
  });

  const events = claim.rows as unknown as Array<{
    id: number;
    event_type: OutboxEventType;
    room: string;
    event_name: string;
    payload: string;
    essential: number;
    attempts: number;
  }>;

  let delivered = 0;
  for (const event of events) {
    const maxAttempts = event.essential ? MAX_ATTEMPTS_ESSENTIAL : MAX_ATTEMPTS_NON_ESSENTIAL;
    try {
      await notifySocketServer({
        room: event.room,
        event: event.event_name,
        data: JSON.parse(event.payload),
      });
      await db.execute({
        sql: "DELETE FROM event_outbox WHERE id = ? AND owner_token = ?",
        args: [event.id, ownerToken],
      });
      delivered += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= maxAttempts) {
        await db.execute({
          sql: `UPDATE event_outbox
                SET status = 'dead', attempts = ?, last_error = ?, owner_token = NULL, claimed_at = NULL
                WHERE id = ? AND owner_token = ?`,
          args: [attempts, message, event.id, ownerToken],
        });
        logger.error("outbox event dead-lettered", {
          eventId: event.id,
          eventType: event.event_type,
          attempts,
          error: message,
        });
      } else {
        await db.execute({
          sql: `UPDATE event_outbox
                SET attempts = ?, next_attempt_at = ?, last_error = ?, owner_token = NULL, claimed_at = NULL
                WHERE id = ? AND owner_token = ?`,
          args: [attempts, now + Math.ceil(retryDelayMs(attempts) / 1000), message, event.id, ownerToken],
        });
      }
    }
  }

  return delivered;
}

/**
 * Total pending events (metric/observability, cheap on the indexed column).
 */
export async function getOutboxBacklog(): Promise<{ pending: number; dead: number }> {
  const pending = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM event_outbox WHERE status = 'pending'",
    args: [],
  });
  const dead = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM event_outbox WHERE status = 'dead'",
    args: [],
  });
  return {
    pending: Number((pending.rows[0] as unknown as { n: number }).n),
    dead: Number((dead.rows[0] as unknown as { n: number }).n),
  };
}
