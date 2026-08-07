import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const notifySocketServer = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer }));

describe("league-scoped viewed timer activation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let claimed = false;
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        if (claimed) return { rowsAffected: 0, rows: [] };
        claimed = true;
        return { rowsAffected: 1, rows: [] };
      }
      return { rowsAffected: 0, rows: [{ response_deadline: 4600 }] };
    });
    notifySocketServer.mockResolvedValue({ success: true });
  });

  it("activates one timer once under concurrent viewed requests", async () => {
    const { activateResponseTimerForViewedAuction } = await import("@/lib/db/services/response-timer-view.service");
    const results = await Promise.all([
      activateResponseTimerForViewedAuction("user-a", 7, 9, 1000),
      activateResponseTimerForViewedAuction("user-a", 7, 9, 1000),
      activateResponseTimerForViewedAuction("user-a", 7, 9, 1000),
    ]);
    expect(results.filter((result) => result.status === "activated")).toHaveLength(1);
    expect(notifySocketServer).toHaveBeenCalledTimes(1);
  });

  it("does not activate a timer from another league", async () => {
    const { activateResponseTimerForViewedAuction } = await import("@/lib/db/services/response-timer-view.service");
    await activateResponseTimerForViewedAuction("user-a", 8, 9, 1000);
    const update = execute.mock.calls[0][0] as { args: unknown[] };
    expect(update.args).toContain(8);
    expect(notifySocketServer).toHaveBeenCalledWith(expect.objectContaining({ room: "user-user-a" }));
  });
});
