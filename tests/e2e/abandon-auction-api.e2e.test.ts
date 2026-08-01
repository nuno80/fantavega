import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NextRequest } from "next/server";

const auth = vi.fn();
const execute = vi.fn();
const notifySocketServer = vi.fn();
const recalculateLockedCreditsForUser = vi.fn().mockResolvedValue(0);

// Track transaction lifecycle: each `db.transaction("write")` call returns a
// fresh object whose execute/commit/rollback delegates to the same mocks.
const txExecute = vi.fn();
const txCommit = vi.fn();
const txRollback = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/db", () => ({
  db: {
    execute,
    transaction: vi.fn(async () => ({
      execute: txExecute,
      commit: txCommit,
      rollback: txRollback,
    })),
  },
}));
vi.mock("@/lib/db/services/locked-credits.service", () => ({
  recalculateLockedCreditsForUser,
}));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer,
}));

const activeAuctionRow = {
  id: 42,
  current_highest_bid_amount: 100,
  current_highest_bidder_id: "user-a",
  timer_duration_minutes: 5,
};

const closingAuctionRow = { ...activeAuctionRow };

const pendingTimerRow = { id: 7, auction_id: 42 };

describe("abandon-auction API flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.mockResolvedValue({ userId: "user-a" });
    txExecute.mockResolvedValue({ rows: [], rowsAffected: 1 });
    txCommit.mockResolvedValue(undefined);
    txRollback.mockResolvedValue(undefined);
  });

  it("rejects an unauthenticated abandon request", async () => {
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );

    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/1/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "1" }) }
    );

    expect(response.status).toBe(401);
    expect(txExecute).not.toHaveBeenCalled();
  });

  it("rejects a request with invalid params", async () => {
    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );

    const response = await POST(
      new Request("https://app.test/api/leagues/abc/players/xyz/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "abc", "player-id": "xyz" }) }
    );

    expect(response.status).toBe(400);
    expect(txExecute).not.toHaveBeenCalled();
  });

  it("abandons a closing auction with a pending timer", async () => {
    txExecute
      .mockResolvedValueOnce({ rows: [closingAuctionRow] }) // find auction
      .mockResolvedValueOnce({ rows: [pendingTimerRow] }); // find timer

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    expect(response.status).toBe(200);

    // Auction lookup must allow both 'active' and 'closing' statuses.
    const auctionQuery = txExecute.mock.calls.find(
      (call) => (call[0] as { sql: string }).sql.includes("FROM auctions a")
    );
    expect(auctionQuery).toBeDefined();
    expect((auctionQuery![0] as { sql: string }).sql).toMatch(/status IN \('active', 'closing'\)/);
    expect((auctionQuery![0] as { sql: string; args: unknown[] }).args).toEqual([9, 1]);

    // Timer lookup must be scoped by the real auction id found above.
    const timerQuery = txExecute.mock.calls.find(
      (call) =>
        (call[0] as { sql: string }).sql.includes("SELECT id, auction_id FROM user_auction_response_timers")
    );
    expect(timerQuery).toBeDefined();
    expect((timerQuery![0] as { sql: string; args: unknown[] }).args).toEqual(["user-a", 42]);
    expect((timerQuery![0] as { sql: string }).sql).toContain("status = 'pending'");

    // The abandon update must keep the atomic status claim.
    const claimQuery = txExecute.mock.calls.find(
      (call) => (call[0] as { sql: string }).sql.includes("SET status = 'abandoned'")
    );
    expect(claimQuery).toBeDefined();
    expect((claimQuery![0] as { sql: string }).sql).toContain("WHERE id = ? AND status = 'pending'");
    expect((claimQuery![0] as { sql: string; args: unknown[] }).args).toEqual([
      expect.any(Number), // processed_at
      7, // timer id
    ]);

    expect(txCommit).toHaveBeenCalled();
    expect(txRollback).not.toHaveBeenCalled();
  });

  it("rejects when no active auction exists for the player", async () => {
    txExecute.mockResolvedValueOnce({ rows: [] }); // no auction

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    expect(response.status).toBe(404);
    expect(txRollback).toHaveBeenCalled();
    expect(txCommit).not.toHaveBeenCalled();
  });

  it("rejects when no pending timer exists for the user and auction", async () => {
    txExecute
      .mockResolvedValueOnce({ rows: [activeAuctionRow] }) // find auction
      .mockResolvedValueOnce({ rows: [] }); // no timer

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    expect(response.status).toBe(404);
    expect(txRollback).toHaveBeenCalled();
    expect(txCommit).not.toHaveBeenCalled();
  });

  it("aborts when the timer is no longer pending (atomic claim)", async () => {
    txExecute
      .mockResolvedValueOnce({ rows: [activeAuctionRow] }) // find auction
      .mockResolvedValueOnce({ rows: [pendingTimerRow] }) // find timer
      .mockResolvedValueOnce({ rows: [], rowsAffected: 0 }); // claim fails

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    expect(response.status).toBe(500);
    expect(txRollback).toHaveBeenCalled();
    expect(txCommit).not.toHaveBeenCalled();
  });

  it("uses the auction found inside the transaction, not any stale timer auction", async () => {
    // The timer query is scoped to the real auction id, and even if a row
    // for another auction slipped through, the identity check must reject it.
    txExecute
      .mockResolvedValueOnce({ rows: [activeAuctionRow] }) // real auction 42
      .mockResolvedValueOnce({ rows: [{ id: 99, auction_id: 99 }] }); // stale timer for another auction

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    // The identity mismatch must abort before any side effect.
    expect(response.status).toBe(404);
    expect(txRollback).toHaveBeenCalled();
    expect(txCommit).not.toHaveBeenCalled();
    expect(
      txExecute.mock.calls.some(
        (call) =>
          (call[0] as { sql: string }).sql.includes("SET status = 'abandoned'")
      )
    ).toBe(false);
  });

  it("checks the timer is scoped to the target auction id", async () => {
    txExecute
      .mockResolvedValueOnce({ rows: [activeAuctionRow] }) // auction 42
      .mockResolvedValueOnce({ rows: [pendingTimerRow] }); // timer

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/abandon/route"
    );
    await POST(
      new Request("https://app.test/api/leagues/1/players/9/abandon") as NextRequest,
      { params: Promise.resolve({ "league-id": "1", "player-id": "9" }) }
    );

    const timerQuery = txExecute.mock.calls.find(
      (call) =>
        (call[0] as { sql: string }).sql.includes("SELECT id, auction_id FROM user_auction_response_timers")
    );
    expect(timerQuery).toBeDefined();
    // auction_id in the timer lookup must equal the real auction id (42),
    // so a stale timer for another auction cannot match.
    expect((timerQuery![0] as { sql: string; args: unknown[] }).args[1]).toBe(42);
  });
});
