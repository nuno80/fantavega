import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMISSION_DEDUP_WINDOW_MS, clearRecentEmissionsForTest, shouldEmit } from "@/lib/socket/dedup";

describe("socket emit dedup", () => {
  beforeEach(() => {
    clearRecentEmissionsForTest();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearRecentEmissionsForTest();
  });

  it("allows a first emission", () => {
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(true);
  });

  it("deduplicates identical emission within the window", () => {
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(true);
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(false);
  });

  it("allows the same event after the window expires", () => {
    shouldEmit("league-1", "budget-update", { budget: 100 });
    vi.advanceTimersByTime(EMISSION_DEDUP_WINDOW_MS + 1);
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(true);
  });

  it("treats different data as a distinct emission", () => {
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(true);
    expect(shouldEmit("league-1", "budget-update", { budget: 120 })).toBe(true);
  });

  it("treats different rooms as distinct emissions", () => {
    expect(shouldEmit("league-1", "budget-update", { budget: 100 })).toBe(true);
    expect(shouldEmit("league-2", "budget-update", { budget: 100 })).toBe(true);
  });

  it("normalizes null data", () => {
    expect(shouldEmit("league-1", "auction-ended", null)).toBe(true);
    expect(shouldEmit("league-1", "auction-ended", undefined)).toBe(false);
  });

  it("caps the map size and prunes old entries", () => {
    // Fill beyond the 500 cap with distinct keys, then verify old ones get pruned.
    for (let i = 0; i < 510; i++) {
      shouldEmit(`league-${i % 50}`, `event-${i}`, { n: i });
    }
    vi.advanceTimersByTime(EMISSION_DEDUP_WINDOW_MS * 2 + 1);
    // A new emission for an old key is now allowed (was pruned).
    expect(shouldEmit("league-0", "event-0", { n: 0 })).toBe(true);
  });
});
