import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";

const LEASE_NAME = "background-scheduler";
const LEASE_DURATION_SECONDS = 45;

let initialized = false;

async function ensureLeaseTable() {
  if (initialized) return;
  await db.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS scheduler_leases (
        lease_name TEXT PRIMARY KEY,
        owner_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `,
    args: [],
  });
  initialized = true;
}

export async function acquireSchedulerLease(
  now = Math.floor(Date.now() / 1000),
): Promise<{ ownerToken: string; expiresAt: number } | null> {
  await ensureLeaseTable();
  const ownerToken = randomUUID();
  const expiresAt = now + LEASE_DURATION_SECONDS;
  const result = await db.execute({
    sql: `
      INSERT INTO scheduler_leases (lease_name, owner_token, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(lease_name) DO UPDATE SET
        owner_token = excluded.owner_token,
        expires_at = excluded.expires_at
      WHERE scheduler_leases.expires_at <= ?
    `,
    args: [LEASE_NAME, ownerToken, expiresAt, now],
  });
  return result.rowsAffected === 1 ? { ownerToken, expiresAt } : null;
}

/**
 * TIME-002: renew the lease before it expires. Fenced: the renew only succeeds
 * if the caller still owns the lease (owner_token matches), so a zombie owner
 * can never extend a lease that was taken over.
 * Returns true if the renew succeeded and the new expiry.
 */
export async function renewSchedulerLease(
  ownerToken: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ renewed: boolean; expiresAt: number }> {
  await ensureLeaseTable();
  const expiresAt = now + LEASE_DURATION_SECONDS;
  const result = await db.execute({
    sql: `UPDATE scheduler_leases SET expires_at = ?
          WHERE lease_name = ? AND owner_token = ?`,
    args: [expiresAt, LEASE_NAME, ownerToken],
  });
  return { renewed: result.rowsAffected === 1, expiresAt };
}

export async function releaseSchedulerLease(ownerToken: string): Promise<void> {
  await ensureLeaseTable();
  await db.execute({
    sql: "DELETE FROM scheduler_leases WHERE lease_name = ? AND owner_token = ?",
    args: [LEASE_NAME, ownerToken],
  });
}

// Exported for TIME-002 tests: the renewal threshold is half the TTL, so the
// scheduler renews before the lease can lapse on slow remote round-trips.
export const LEASE_RENEW_THRESHOLD_SECONDS = Math.floor(LEASE_DURATION_SECONDS / 2);

export function shouldRenewLease(expiresAt: number, now = Math.floor(Date.now() / 1000)): boolean {
  return now >= expiresAt - LEASE_RENEW_THRESHOLD_SECONDS;
}
