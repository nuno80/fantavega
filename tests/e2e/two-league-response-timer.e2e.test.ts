import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const notifySocketServer = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer }));
vi.mock("@/lib/db/services/session.service", () => ({ getUserLastLogin: vi.fn() }));

describe("two-league response timer isolation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    execute.mockImplementation(async ({ sql, args }: { sql: string; args?: unknown[] }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        return { rowsAffected: args?.includes(7) ? 1 : 0, rows: [] };
      }
      if (sql.includes("SELECT response_deadline")) return { rows: [{ response_deadline: null }] };
      return { rows: [{ id: 9 }], rowsAffected: 0 };
    });
    notifySocketServer.mockResolvedValue({ success: true });
  });

  it("activates only the viewed league timer", async () => {
    const { activateResponseTimerForViewedAuction } = await import("@/lib/db/services/response-timer-view.service");
    const viewed = await activateResponseTimerForViewedAuction("user-a", 7, 9, 1_000);
    const other = await activateResponseTimerForViewedAuction("user-a", 8, 9, 1_000);
    expect(viewed.status).toBe("activated");
    expect(other.status).not.toBe("activated");
    expect(notifySocketServer).toHaveBeenCalledTimes(1);
  });

  it("does not activate twice under concurrent views", async () => {
    let claimed = false;
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        if (claimed) return { rowsAffected: 0, rows: [{ response_deadline: 4600 }] };
        claimed = true;
        return { rowsAffected: 1, rows: [] };
      }
      return { rows: [{ id: 9, response_deadline: null }], rowsAffected: 0 };
    });
    const { activateResponseTimerForViewedAuction } = await import("@/lib/db/services/response-timer-view.service");
    const results = await Promise.all([
      activateResponseTimerForViewedAuction("user-a", 7, 9, 1_000),
      activateResponseTimerForViewedAuction("user-a", 7, 9, 1_000),
    ]);
    expect(results.filter((result) => result.status === "activated")).toHaveLength(1);
    expect(notifySocketServer).toHaveBeenCalledTimes(1);
  });
});
