import { describe, expect, it } from "vitest";
import { getGhostSessionEnd, getTimerActivationTime, isHeartbeatFresh, SESSION_STALENESS_SECONDS } from "./session-liveness";

describe("ghost session timer invariants", () => {
  it("expires a heartbeat exactly at the staleness boundary", () => {
    const now = 10_000;
    expect(isHeartbeatFresh(now - SESSION_STALENESS_SECONDS, now)).toBe(false);
    expect(isHeartbeatFresh(now - SESSION_STALENESS_SECONDS + 1, now)).toBe(true);
  });

  it("closes a ghost at its last known activity", () => {
    expect(getGhostSessionEnd(8_000, 7_000)).toBe(8_000);
    expect(getGhostSessionEnd(null, 7_000)).toBe(7_000);
  });

  it("anchors activation to the actual return time", () => {
    const staleLogin = 1_000;
    const returnedAt = 20_000;
    expect(getTimerActivationTime(returnedAt)).toBe(returnedAt);
    expect(getTimerActivationTime(returnedAt)).not.toBe(staleLogin);
  });
});
