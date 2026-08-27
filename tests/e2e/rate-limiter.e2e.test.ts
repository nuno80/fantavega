import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const databasePath = join(tmpdir(), `fantavega-sec-004-${randomUUID()}.db`);
const testDb = createClient({ url: `file:${databasePath}` });

vi.mock("@/lib/db", () => ({ db: testDb }));

async function setupSchema(db: Client) {
  await db.batch(
    [
      "DROP TABLE IF EXISTS rate_limit_counters",
      `CREATE TABLE rate_limit_counters (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER NOT NULL
      )`,
    ].map((sql) => ({ sql, args: [] })),
    "write",
  );
}

describe("SEC-004 — Distributed rate limiter", () => {
  beforeAll(async () => {
    await setupSchema(testDb);
  });

  beforeEach(async () => {
    await testDb.execute({ sql: "DELETE FROM rate_limit_counters", args: [] });
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    testDb.close();
    await rm(databasePath, { force: true });
  });

  it("allows requests under the limit", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    const result = await checkRateLimit("user1", "bid_manual", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests at the limit", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    for (let i = 0; i < 3; i++) {
      await checkRateLimit("user2", "bid_manual", 3, 60_000);
    }
    const result = await checkRateLimit("user2", "bid_manual", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    // Exhaust limit
    for (let i = 0; i < 3; i++) {
      await checkRateLimit("user3", "bid_manual", 3, 60_000);
    }
    const blocked = await checkRateLimit("user3", "bid_manual", 3, 60_000);
    expect(blocked.allowed).toBe(false);

    // Force expiry deterministically: rewind expires_at into the past
    await testDb.execute({
      sql: "UPDATE rate_limit_counters SET expires_at = 0 WHERE key = 'user3:bid_manual'",
      args: [],
    });

    const result = await checkRateLimit("user3", "bid_manual", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("isolates different users", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    for (let i = 0; i < 3; i++) {
      await checkRateLimit("userA", "bid_manual", 3, 60_000);
    }
    // userA is blocked
    expect(
      (await checkRateLimit("userA", "bid_manual", 3, 60_000)).allowed,
    ).toBe(false);

    // userB is fine
    expect(
      (await checkRateLimit("userB", "bid_manual", 3, 60_000)).allowed,
    ).toBe(true);
  });

  it("isolates different actions for the same user", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    for (let i = 0; i < 3; i++) {
      await checkRateLimit("user4", "bid_manual", 3, 60_000);
    }
    // manual blocked
    expect(
      (await checkRateLimit("user4", "bid_manual", 3, 60_000)).allowed,
    ).toBe(false);

    // auto still allowed
    expect(
      (await checkRateLimit("user4", "bid_auto", 3, 60_000)).allowed,
    ).toBe(true);
  });

  it("fails open when DB errors", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    // Sabotage the DB by dropping the table
    await testDb.execute({
      sql: "DROP TABLE IF EXISTS rate_limit_counters",
      args: [],
    });

    const result = await checkRateLimit("user5", "bid_manual", 3, 60_000);
    // fail-open: should allow
    expect(result.allowed).toBe(true);

    // Restore for other tests
    await setupSchema(testDb);
  });

  it("returns a resetTime in the future", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");

    const before = Date.now();
    const result = await checkRateLimit("user6", "bid_manual", 5, 60_000);
    expect(result.resetTime).toBeGreaterThanOrEqual(before + 59_000);
  });
});
