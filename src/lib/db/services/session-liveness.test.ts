import { describe, expect, it } from "vitest";

import {
  getGhostSessionEnd,
  getTimerActivationTime,
  isHeartbeatFresh,
  SESSION_STALENESS_SECONDS,
} from "./session-liveness";

describe("session liveness", () => {
  it("treats a recent heartbeat as online", () => {
    const now = 1_000;
    expect(isHeartbeatFresh(now - SESSION_STALENESS_SECONDS + 1, now)).toBe(true);
  });

  it("treats a missing or stale heartbeat as a ghost session", () => {
    const now = 1_000;
    expect(isHeartbeatFresh(null, now)).toBe(false);
    expect(isHeartbeatFresh(now - SESSION_STALENESS_SECONDS, now)).toBe(false);
  });

  it("closes a ghost session at its last known activity", () => {
    expect(getGhostSessionEnd(800, 700)).toBe(800);
    expect(getGhostSessionEnd(null, 700)).toBe(700);
  });

  it("starts a pending response timer from the real return time", () => {
    expect(getTimerActivationTime(5_000)).toBe(5_000);
  });
});
