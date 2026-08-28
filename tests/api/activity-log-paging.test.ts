import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, execute } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({ db: { execute } }));

// Deterministic per-source history: 3 bid events + 1 tx event, timestamps
// chosen so we can assert the k-way merge order across pages.
function queryResult(rows: Record<string, unknown>[]) {
  return { rows, columns: [], columnTypes: [], lastInsertRowid: undefined, changes: 0 };
}

// Mock DB that honors trailing (limit, offset) args like the real engine.
function pagedResult(rows: Record<string, unknown>[], args: unknown[]) {
  const limit = Number(args.at(-2));
  const offset = Number(args.at(-1));
  return queryResult(rows.slice(offset, offset + limit));
}

async function callGet(url: string) {
  const { GET } = await import(
    "@/app/api/leagues/[league-id]/activity-log/route"
  );
  const request = { nextUrl: new URL(url) } as never;
  return GET(
    request,
    { params: Promise.resolve({ "league-id": "1" }) } as never
  );
}

const BID_ROWS = [
  { id: 3, user_id: "u1", amount: 3, bid_time: 30, bid_type: "manual", auction_id: 1, username: "Uno", full_name: null, player_name: "P3", player_role: "A" },
  { id: 2, user_id: "u1", amount: 2, bid_time: 20, bid_type: "auto", auction_id: 1, username: "Uno", full_name: null, player_name: "P2", player_role: "A" },
  { id: 1, user_id: "u1", amount: 1, bid_time: 10, bid_type: "quick", auction_id: 1, username: "Uno", full_name: null, player_name: "P1", player_role: "A" },
];

const TX_ROWS = [
  { id: 3, user_id: "u1", transaction_type: "initial_allocation", amount: 100, description: null, balance_after_in_league: 100, transaction_time: 35, username: "Uno", full_name: null, player_name: null },
];

describe("PERF-001 activity log route paging", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    execute.mockReset();
    currentUser.mockResolvedValue({ id: "u1", publicMetadata: {} });
    execute.mockImplementation(async ({ sql, args }: { sql: string; args: unknown[] }) => {
      if (sql.includes("league_participants WHERE")) return queryResult([{ "1": 1 }]);
      if (sql.includes("FROM league_participants lp")) return queryResult([]);
      if (sql.includes("FROM bids b")) return pagedResult(BID_ROWS, args);
      if (sql.includes("FROM budget_transactions bt")) return pagedResult(TX_ROWS, args);
      return queryResult([]);
    });
  });

  it("k-way merges the source windows, newest first, capped at the page size", async () => {
    const response = await callGet("http://localhost/api/leagues/1/activity-log?limit=2");
    expect(response.status).toBe(200);
    const body = await response.json();

    // tx (35) and bid-3 (30) are the two newest events across all sources.
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(["tx-3", "bid-3"]);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
  });

  it("follows the cursor without duplicates or gaps", async () => {
    const page1 = await (await callGet("http://localhost/api/leagues/1/activity-log?limit=2")).json();
    const page2 = await (
      await callGet(`http://localhost/api/leagues/1/activity-log?limit=2&cursor=${page1.nextCursor}`)
    ).json();

    const ids = [...page1.events, ...page2.events].map((e: { id: string }) => e.id);
    // All 4 available events delivered exactly once across the two pages.
    expect(new Set(ids)).toEqual(new Set(["bid-3", "bid-2", "bid-1", "tx-3"]));
    expect(ids).toHaveLength(4);
    // Page 2 continues in global order from where page 1 stopped. A full
    // window can't prove exhaustion (OFFSET semantics), so page 2 still
    // reports hasMore; page 3 comes back empty and terminates the paging.
    expect(page2.events.map((e: { id: string }) => e.id)).toEqual(["bid-2", "bid-1"]);
    const page3 = await (
      await callGet(`http://localhost/api/leagues/1/activity-log?limit=2&cursor=${page2.nextCursor}`)
    ).json();
    expect(page3.events).toHaveLength(0);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();
  });

  it("hasMore is false only when every source window is short", async () => {
    const body = await (await callGet("http://localhost/api/leagues/1/activity-log?limit=50")).json();
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.events).toHaveLength(4);
  });

  it("propagates the user filter into the bids query", async () => {
    await callGet("http://localhost/api/leagues/1/activity-log?userId=u9&limit=50");
    const bidCall = execute.mock.calls
      .map((call) => call[0] as { sql: string; args: unknown[] })
      .find((call) => call.sql.includes("FROM bids b"));
    expect(bidCall?.sql).toContain("b.user_id = ?");
    expect(bidCall?.args).toContain("u9");
  });
});
