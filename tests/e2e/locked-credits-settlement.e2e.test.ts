import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const databasePath = join(tmpdir(), `fantavega-rel-003-${randomUUID()}.db`);
const testDb = createClient({ url: `file:${databasePath}` });

vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/services/auction-states.service", () => ({
  handleBidderChange: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/services/penalty.service", () => ({
  checkAndRecordCompliance: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/services/response-timer.service", () => ({
  cancelResponseTimer: vi.fn().mockResolvedValue(undefined),
  createResponseTimer: vi.fn().mockResolvedValue(undefined),
  getUserCooldownInfo: vi.fn().mockResolvedValue(null),
}));

async function resetReconcilerFixture(db: Client) {
  await db.batch(
    [
      "DROP TABLE IF EXISTS auto_bids",
      "DROP TABLE IF EXISTS auctions",
      "DROP TABLE IF EXISTS league_participants",
      "DROP TABLE IF EXISTS budget_transactions",
      "DROP TABLE IF EXISTS player_assignments",
      "DROP TABLE IF EXISTS players",
      `CREATE TABLE league_participants (
        league_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        current_budget INTEGER NOT NULL DEFAULT 500,
        locked_credits INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (league_id, user_id)
      )`,
      `CREATE TABLE auctions (
        id INTEGER PRIMARY KEY,
        auction_league_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL DEFAULT 1,
        scheduled_end_time INTEGER NOT NULL DEFAULT 0,
        current_highest_bid_amount INTEGER NOT NULL DEFAULT 0,
        current_highest_bidder_id TEXT,
        status TEXT NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE auto_bids (
        id INTEGER PRIMARY KEY,
        auction_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        max_amount INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER
      )`,
      `CREATE TABLE players (
        id INTEGER PRIMARY KEY,
        role TEXT NOT NULL,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE budget_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_league_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after_in_league INTEGER NOT NULL,
        description TEXT
      )`,
      `CREATE TABLE player_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auction_league_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        purchase_price INTEGER NOT NULL,
        assigned_at INTEGER NOT NULL,
        UNIQUE (auction_league_id, player_id)
      )`,
    ],
    "write",
  );
}

describe("locked credits after settlement", () => {
  beforeAll(async () => {
    await resetReconcilerFixture(testDb);
  });

  beforeEach(async () => {
    await testDb.batch(
      [
        "DELETE FROM auto_bids",
        "DELETE FROM auctions",
        "DELETE FROM league_participants",
        "DELETE FROM budget_transactions",
        "DELETE FROM player_assignments",
        "DELETE FROM players",
      ],
      "write",
    );
  });

  afterAll(async () => {
    testDb.close();
    await rm(databasePath, { force: true });
  });

  it("releases ghost credits after the last auction has already been sold", async () => {
    await testDb.batch(
      [
        {
          sql: "INSERT INTO league_participants (league_id, user_id, locked_credits) VALUES (?, ?, ?)",
          args: [7, "loser-a", 30],
        },
        {
          sql: "INSERT INTO auctions (id, auction_league_id, status) VALUES (?, ?, ?)",
          args: [101, 7, "sold"],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [1, 101, "loser-a", 30, 0],
        },
      ],
      "write",
    );

    const { reconcileLockedCreditsForActiveLeagues } = await import(
      "@/lib/db/services/locked-credits.service"
    );

    await expect(reconcileLockedCreditsForActiveLeagues()).resolves.toBe(1);
    const participant = await testDb.execute({
      sql: "SELECT locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [7, "loser-a"],
    });
    expect(Number(participant.rows[0].locked_credits)).toBe(0);
  });

  it("reports invariant mismatches and reconciles them idempotently", async () => {
    await testDb.batch(
      [
        {
          sql: "INSERT INTO league_participants (league_id, user_id, locked_credits) VALUES (?, ?, ?)",
          args: [7, "manual-winner", 99],
        },
        {
          sql: `INSERT INTO auctions
            (id, auction_league_id, player_id, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [101, 7, 1, 9_999_999_999, 12, "manual-winner", "active"],
        },
      ],
      "write",
    );

    const {
      findLockedCreditMismatchesForLeague,
      reconcileLockedCreditsForLeague,
    } = await import("@/lib/db/services/locked-credits.service");

    await expect(findLockedCreditMismatchesForLeague(7)).resolves.toEqual([
      {
        userId: "manual-winner",
        storedLockedCredits: 99,
        activeExposure: 12,
      },
    ]);

    await reconcileLockedCreditsForLeague(7);
    await reconcileLockedCreditsForLeague(7);

    await expect(findLockedCreditMismatchesForLeague(7)).resolves.toEqual([]);
  });

  it("rejects invalid league identifiers before querying the database", async () => {
    const {
      findLockedCreditMismatchesForLeague,
      reconcileLockedCreditsForLeague,
    } = await import("@/lib/db/services/locked-credits.service");

    await expect(findLockedCreditMismatchesForLeague(0)).rejects.toThrow(
      "positive safe integer",
    );
    await expect(reconcileLockedCreditsForLeague(Number.NaN)).rejects.toThrow(
      "positive safe integer",
    );
  });

  it("rejects malformed invariant rows instead of coercing missing values", async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [{ user_id: null, locked_credits: 10, active_exposure: 0 }],
      rowsAffected: 0,
    });
    const executor = { execute } as unknown as Pick<Client, "execute">;
    const { findLockedCreditMismatchesForLeague } = await import(
      "@/lib/db/services/locked-credits.service"
    );

    await expect(findLockedCreditMismatchesForLeague(7, executor)).rejects.toThrow(
      "user_id",
    );
  });

  it("does not rewrite a candidate league whose stored credits already match exposure", async () => {
    await testDb.batch(
      [
        {
          sql: "INSERT INTO league_participants (league_id, user_id, locked_credits) VALUES (?, ?, ?)",
          args: [7, "manual-winner", 12],
        },
        {
          sql: `INSERT INTO auctions
            (id, auction_league_id, player_id, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [101, 7, 1, 9_999_999_999, 12, "manual-winner", "active"],
        },
      ],
      "write",
    );

    const { reconcileLockedCreditsForActiveLeagues } = await import(
      "@/lib/db/services/locked-credits.service"
    );

    await expect(reconcileLockedCreditsForActiveLeagues()).resolves.toBe(0);
  });

  it("reconciles mismatched leagues in bounded batches and emits a metric", async () => {
    const inserts = Array.from({ length: 26 }, (_, index) => ({
      sql: "INSERT INTO league_participants (league_id, user_id, locked_credits) VALUES (?, ?, ?)",
      args: [index + 1, `user-${index + 1}`, 10],
    }));
    await testDb.batch(inserts, "write");
    const metric = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { reconcileLockedCreditsForActiveLeagues } = await import(
      "@/lib/db/services/locked-credits.service"
    );

    await expect(reconcileLockedCreditsForActiveLeagues()).resolves.toBe(25);
    const remaining = await testDb.execute(
      "SELECT COUNT(*) AS count FROM league_participants WHERE locked_credits <> 0",
    );
    expect(Number(remaining.rows[0].count)).toBe(1);
    expect(metric).toHaveBeenCalledWith("[LOCKED_CREDITS_RECONCILE]", {
      mismatchedLeagues: 25,
      updatedParticipants: 25,
    });

    await expect(reconcileLockedCreditsForActiveLeagues()).resolves.toBe(1);
    metric.mockRestore();
  });

  it("settles the last auction and rebuilds every losing bidder from active exposure", async () => {
    await testDb.batch(
      [
        "INSERT INTO players (id, role, name) VALUES (1, 'A', 'Last Player')",
        {
          sql: "INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits) VALUES (?, ?, ?, ?)",
          args: [7, "winner", 500, 50],
        },
        {
          sql: "INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits) VALUES (?, ?, ?, ?)",
          args: [7, "loser-a", 500, 41],
        },
        {
          sql: "INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits) VALUES (?, ?, ?, ?)",
          args: [7, "loser-b", 500, 25],
        },
        {
          sql: `INSERT INTO auctions
            (id, auction_league_id, player_id, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [101, 7, 1, 1, 40, "winner", "active"],
        },
        {
          sql: `INSERT INTO auctions
            (id, auction_league_id, player_id, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [102, 7, 2, 9_999_999_999, 0, null, "active"],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [1, 101, "winner", 50, 1],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [2, 101, "loser-a", 30, 1],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [3, 101, "loser-b", 25, 1],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [4, 102, "loser-a", 11, 1],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [5, 102, "loser-b", 99, 0],
        },
      ],
      "write",
    );

    const { processExpiredAuctionsAndAssignPlayers } = await import(
      "@/lib/db/services/bid.service"
    );

    await expect(processExpiredAuctionsAndAssignPlayers(7)).resolves.toEqual({
      processedCount: 1,
      failedCount: 0,
      errors: [],
    });

    const participants = await testDb.execute({
      sql: "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = ? ORDER BY user_id",
      args: [7],
    });
    expect(
      participants.rows.map((row) => ({
        userId: String(row.user_id),
        budget: Number(row.current_budget),
        lockedCredits: Number(row.locked_credits),
      })),
    ).toEqual([
      { userId: "loser-a", budget: 500, lockedCredits: 11 },
      { userId: "loser-b", budget: 500, lockedCredits: 0 },
      { userId: "winner", budget: 460, lockedCredits: 0 },
    ]);

    const assignmentCount = await testDb.execute(
      "SELECT COUNT(*) AS count FROM player_assignments",
    );
    expect(Number(assignmentCount.rows[0].count)).toBe(1);
  });

  it("commits a concurrent settlement only once and treats the retry as a no-op", async () => {
    await testDb.batch(
      [
        "INSERT INTO players (id, role, name) VALUES (1, 'A', 'Concurrent Player')",
        {
          sql: "INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits) VALUES (?, ?, ?, ?)",
          args: [7, "winner", 500, 50],
        },
        {
          sql: `INSERT INTO auctions
            (id, auction_league_id, player_id, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [101, 7, 1, 1, 40, "winner", "active"],
        },
        {
          sql: "INSERT INTO auto_bids (id, auction_id, user_id, max_amount, is_active) VALUES (?, ?, ?, ?, ?)",
          args: [1, 101, "winner", 50, 1],
        },
      ],
      "write",
    );

    const { processExpiredAuctionsAndAssignPlayers } = await import(
      "@/lib/db/services/bid.service"
    );
    const results = await Promise.all([
      processExpiredAuctionsAndAssignPlayers(7),
      processExpiredAuctionsAndAssignPlayers(7),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        { processedCount: 1, failedCount: 0, errors: [] },
        { processedCount: 0, failedCount: 0, errors: [] },
      ]),
    );

    const participant = await testDb.execute({
      sql: "SELECT current_budget, locked_credits FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [7, "winner"],
    });
    expect({
      budget: Number(participant.rows[0].current_budget),
      lockedCredits: Number(participant.rows[0].locked_credits),
    }).toEqual({ budget: 460, lockedCredits: 0 });

    const sideEffects = await testDb.execute(`
      SELECT
        (SELECT COUNT(*) FROM player_assignments) AS assignments,
        (SELECT COUNT(*) FROM budget_transactions) AS transactions
    `);
    expect({
      assignments: Number(sideEffects.rows[0].assignments),
      transactions: Number(sideEffects.rows[0].transactions),
    }).toEqual({ assignments: 1, transactions: 1 });
  });
});
