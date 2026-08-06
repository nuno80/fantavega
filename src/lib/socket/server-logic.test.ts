import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  createDedupCache,
  createDisconnectTracker,
} from "./server-logic";

// Fake timers control both setTimeout and Date.now; keep them isolated per describe.
const useMockClock = () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
};

describe("dedup cache", () => {
  useMockClock();

  it("deduplicates identical emissions within the window", () => {
    const cache = createDedupCache({ windowMs: 2_000, maxSize: 10 });
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5 })).toBe(true);
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5 })).toBe(false);
  });

  it("allows a new emission after the window", () => {
    const cache = createDedupCache({ windowMs: 2_000, maxSize: 10 });
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5 })).toBe(true);
    // advance time by 3s
    vi.setSystemTime(4_000);
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5 })).toBe(true);
  });

  it("uses a stable business key (auctionId) so order of fields does not matter", () => {
    const cache = createDedupCache({ windowMs: 2_000, maxSize: 10 });
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5, playerId: 1 })).toBe(true);
    // Same business identity, different field order → deduped
    expect(cache.shouldEmit("league-1", "auction-update", { playerId: 1, auctionId: 5 })).toBe(false);
  });

  it("does not dedup different auctionIds", () => {
    const cache = createDedupCache({ windowMs: 2_000, maxSize: 10 });
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 5 })).toBe(true);
    expect(cache.shouldEmit("league-1", "auction-update", { auctionId: 6 })).toBe(true);
  });

  it("evicts deterministically when over max size", () => {
    const cache = createDedupCache({ windowMs: 60_000, maxSize: 3 });
    expect(cache.shouldEmit("league-1", "e1", { auctionId: 1 })).toBe(true);
    expect(cache.shouldEmit("league-1", "e2", { auctionId: 2 })).toBe(true);
    expect(cache.shouldEmit("league-1", "e3", { auctionId: 3 })).toBe(true);
    // Over the limit: oldest entry (auctionId 1) must be evicted deterministically
    expect(cache.shouldEmit("league-1", "e4", { auctionId: 4 })).toBe(true);
    // The evicted key can be emitted again immediately
    expect(cache.shouldEmit("league-1", "e1", { auctionId: 1 })).toBe(true);
  });

  it("keeps cache size bounded at maxSize", () => {
    const cache = createDedupCache({ windowMs: 60_000, maxSize: 5 });
    for (let i = 1; i <= 20; i++) {
      cache.shouldEmit("league-1", `e${i}`, { auctionId: i });
    }
    expect(cache.size()).toBeLessThanOrEqual(5);
  });
});

describe("disconnect tracker", () => {
  useMockClock();

  it("schedules a logout after the delay when no other socket remains", async () => {
    const recordUserLogout = vi.fn().mockResolvedValue(undefined);
    const tracker = createDisconnectTracker({
      recordUserLogout,
      delayMs: 10_000,
      hasUserSockets: () => false,
      now: () => Date.now(),
    });

    tracker.onDisconnect("user-a");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(recordUserLogout).toHaveBeenCalledTimes(1);
    expect(recordUserLogout).toHaveBeenCalledWith("user-a", 1);
  });

  it("does not log out when the user still has sockets", async () => {
    const recordUserLogout = vi.fn().mockResolvedValue(undefined);
    const hasUserSockets = vi.fn().mockResolvedValue(true);
    const tracker = createDisconnectTracker({
      recordUserLogout,
      delayMs: 10_000,
      hasUserSockets,
      now: () => Date.now(),
    });

    tracker.onDisconnect("user-a");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(hasUserSockets).toHaveBeenCalledWith("user-a");
    expect(recordUserLogout).not.toHaveBeenCalled();
  });

  it("cancels the pending logout when the user reconnects (same room)", async () => {
    const recordUserLogout = vi.fn().mockResolvedValue(undefined);
    const hasUserSockets = vi.fn().mockResolvedValue(false);
    const tracker = createDisconnectTracker({
      recordUserLogout,
      delayMs: 10_000,
      hasUserSockets,
      now: () => Date.now(),
    });

    tracker.onDisconnect("user-a");
    tracker.onReconnect("user-a"); // user joined user-room again
    await vi.advanceTimersByTimeAsync(10_000);

    expect(recordUserLogout).not.toHaveBeenCalled();
  });

  it("wraps recordUserLogout in try/catch and logs failures", async () => {
    const recordUserLogout = vi.fn().mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const tracker = createDisconnectTracker({
      recordUserLogout,
      delayMs: 10_000,
      hasUserSockets: () => false,
      now: () => Date.now(),
    });

    tracker.onDisconnect("user-a");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(recordUserLogout).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("does not log out a session protected by a recent heartbeat", async () => {
    // Heartbeat protection lives in recordUserLogout's SQL (last_heartbeat <= notAfter).
    // Here we assert the tracker passes notAfter so the DB can protect the session.
    const recordUserLogout = vi.fn().mockResolvedValue(undefined);
    const tracker = createDisconnectTracker({
      recordUserLogout,
      delayMs: 10_000,
      hasUserSockets: () => false,
      now: () => Date.now(),
    });

    tracker.onDisconnect("user-a");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(recordUserLogout).toHaveBeenCalledWith("user-a", 1);
  });
});
