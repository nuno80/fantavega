import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const databasePath = join(tmpdir(), `fantavega-rel-004-${randomUUID()}.db`);
const testDb = createClient({ url: `file:${databasePath}` });

vi.mock("@/lib/db", () => ({ db: testDb }));

// Helpers

async function setupSchema(db: Client) {
  await db.batch(
    [
      "DROP TABLE IF EXISTS budget_transactions",
      "DROP TABLE IF EXISTS league_participants",
      `CREATE TABLE league_participants (
        league_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        current_budget INTEGER NOT NULL DEFAULT 500,
        locked_credits INTEGER NOT NULL DEFAULT 0,
        manager_team_name TEXT,
        updated_at INTEGER,
        PRIMARY KEY (league_id, user_id)
      )`,
      `CREATE TABLE budget_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_league_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT,
        balance_after_in_league INTEGER NOT NULL,
        transaction_time INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
    ].map((sql) => ({ sql, args: [] })),
    "write",
  );
}

const LEAGUE = 1;
const USER = "user_a";

async function seedParticipant(db: Client, budget = 500) {
  await db.execute({
    sql: `INSERT INTO league_participants (league_id, user_id, current_budget) VALUES (?, ?, ?)`,
    args: [LEAGUE, USER, budget],
  });
}

async function getBudget(db: Client): Promise<number> {
  const r = await db.execute({
    sql: `SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?`,
    args: [LEAGUE, USER],
  });
  return r.rows[0].current_budget as number;
}

async function getLedgerEntries(db: Client) {
  const r = await db.execute({
    sql: `SELECT * FROM budget_transactions WHERE auction_league_id = ? AND user_id = ? ORDER BY id`,
    args: [LEAGUE, USER],
  });
  return r.rows;
}

// Test suite

describe("REL-004 — Budget/ledger atomicity", () => {
  beforeAll(async () => {
    await setupSchema(testDb);
  });

  beforeEach(async () => {
    await testDb.execute({ sql: "DELETE FROM budget_transactions", args: [] });
    await testDb.execute({ sql: "DELETE FROM league_participants", args: [] });
  });

  afterAll(async () => {
    testDb.close();
    await rm(databasePath, { force: true });
  });

  it("adjustBudgetAtomically increases budget and records ledger in one transaction", async () => {
    await seedParticipant(testDb, 500);

    const { adjustBudgetAtomically } = await import(
      "@/lib/db/services/budget.service"
    );

    const result = await adjustBudgetAtomically(LEAGUE, USER, 50, "Test increase");
    expect(result.success).toBe(true);
    expect(result.newBudget).toBe(550);

    expect(await getBudget(testDb)).toBe(550);

    const entries = await getLedgerEntries(testDb);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(50);
    expect(entries[0].balance_after_in_league).toBe(550);
    expect(entries[0].transaction_type).toBe("admin_budget_increase");
  });

  it("adjustBudgetAtomically decreases budget and records ledger in one transaction", async () => {
    await seedParticipant(testDb, 500);

    const { adjustBudgetAtomically } = await import(
      "@/lib/db/services/budget.service"
    );

    const result = await adjustBudgetAtomically(LEAGUE, USER, -100, "Test decrease");
    expect(result.success).toBe(true);
    expect(result.newBudget).toBe(400);

    expect(await getBudget(testDb)).toBe(400);

    const entries = await getLedgerEntries(testDb);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(-100);
    expect(entries[0].balance_after_in_league).toBe(400);
    expect(entries[0].transaction_type).toBe("admin_budget_decrease");
  });

  it("rejects decrease that would make budget negative", async () => {
    await seedParticipant(testDb, 100);

    const { adjustBudgetAtomically } = await import(
      "@/lib/db/services/budget.service"
    );

    const result = await adjustBudgetAtomically(LEAGUE, USER, -200, "Too much");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/negativ/i);

    // Budget unchanged, no ledger entry
    expect(await getBudget(testDb)).toBe(100);
    expect(await getLedgerEntries(testDb)).toHaveLength(0);
  });

  it("rejects adjustment for non-existent participant", async () => {
    // No participant seeded
    const { adjustBudgetAtomically } = await import(
      "@/lib/db/services/budget.service"
    );

    const result = await adjustBudgetAtomically(LEAGUE, "ghost", 50, "Nobody home");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/non trovato/i);
  });

  it("ledger balance_after_in_league is consistent after sequential adjustments", async () => {
    await seedParticipant(testDb, 500);

    const { adjustBudgetAtomically } = await import(
      "@/lib/db/services/budget.service"
    );

    await adjustBudgetAtomically(LEAGUE, USER, 100, "First");
    await adjustBudgetAtomically(LEAGUE, USER, -50, "Second");
    await adjustBudgetAtomically(LEAGUE, USER, 25, "Third");

    expect(await getBudget(testDb)).toBe(575);

    const entries = await getLedgerEntries(testDb);
    expect(entries).toHaveLength(3);
    expect(entries[0].balance_after_in_league).toBe(600);
    expect(entries[1].balance_after_in_league).toBe(550);
    expect(entries[2].balance_after_in_league).toBe(575);
  });
});
