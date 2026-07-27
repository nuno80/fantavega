import { describe, expect, it } from "vitest";

import {
  getGhostSessionEnd,
  getTimerActivationTime,
  isHeartbeatFresh,
  SESSION_STALENESS_SECONDS,
} from "@/lib/db/services/session-liveness";

describe("ghost-session timer invariants", () => {
  it("does not consider a hard-closed tab online after the liveness window", () => {
    const now = 10_000;
    expect(isHeartbeatFresh(now - SESSION_STALENESS_SECONDS - 1, now)).toBe(false);
  });

  it("uses the last heartbeat when closing a ghost session", () => {
    expect(getGhostSessionEnd(8_000, 7_000)).toBe(8_000);
  });

  it("never anchors a newly activated timer to the stale login timestamp", () => {
    const staleLogin = 1_000;
    const actualReturn = 20_000;
    expect(getTimerActivationTime(actualReturn)).toBe(actualReturn);
    expect(getTimerActivationTime(actualReturn)).not.toBe(staleLogin);
  });
});
