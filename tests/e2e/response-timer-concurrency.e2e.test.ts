import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const notifySocketServer = vi.fn();

vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer }));
vi.mock("@/lib/db/services/session.service", () => ({ getUserLastLogin: vi.fn() }));

describe("response timer concurrent activation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    let claimed = false;
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("SELECT urt.id, urt.auction_id")) return { rows: [{ id: 1, auction_id: 9, auction_league_id: 7 }] };
      if (sql.includes("SET response_deadline")) {
        if (claimed) return { rows: [], rowsAffected: 0 };
        claimed = true;
        return { rows: [], rowsAffected: 1 };
      }
      if (sql.includes("SELECT urt.auction_id")) return { rows: [] };
      return { rows: [], rowsAffected: 0 };
    });
    notifySocketServer.mockResolvedValue({ success: true });
  });

  it("claims a timer only once under concurrent polling", async () => {
    const { activateTimersForUser } = await import("@/lib/db/services/response-timer.service");
    await Promise.all([
      activateTimersForUser("user-a", 1_000),
      activateTimersForUser("user-a", 1_000),
      activateTimersForUser("user-a", 1_000),
    ]);
    const starts = notifySocketServer.mock.calls.filter(([event]) => event.event === "response-timer-started");
    expect(starts).toHaveLength(1);
  });

  it("uses one stable deadline for all racing requests", async () => {
    const { activateTimersForUser } = await import("@/lib/db/services/response-timer.service");
    await Promise.all([activateTimersForUser("user-a", 2_000), activateTimersForUser("user-a", 2_000)]);
    const updateCalls = execute.mock.calls.filter(([query]) => query.sql.includes("SET response_deadline"));
    expect(updateCalls.every(([query]) => query.args[0] === 5_600)).toBe(true);
  });
});
