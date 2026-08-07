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

export async function releaseSchedulerLease(ownerToken: string): Promise<void> {
  await ensureLeaseTable();
  await db.execute({
    sql: "DELETE FROM scheduler_leases WHERE lease_name = ? AND owner_token = ?",
    args: [LEASE_NAME, ownerToken],
  });
}
