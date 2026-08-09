import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.fn();
const auth = vi.fn();
const execute = vi.fn();
const updateHeartbeat = vi.fn();
const recordUserLogout = vi.fn();
const activateTimersForUser = vi.fn();
const hasLeagueAccess = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ currentUser, auth }));
vi.mock("@/lib/auth/league-guard", () => ({ hasLeagueAccess }));
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/db/services/session.service", () => ({ updateHeartbeat, recordUserLogout }));
vi.mock("@/lib/db/services/response-timer.service", () => ({ activateTimersForUser }));

describe("ghost-session API flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({ id: "user-a" });
    auth.mockResolvedValue({ userId: "user-a" });
    updateHeartbeat.mockResolvedValue(1_000);
    recordUserLogout.mockResolvedValue(undefined);
    activateTimersForUser.mockResolvedValue(undefined);
    hasLeagueAccess.mockResolvedValue(true);
    execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  it("rejects unauthenticated requests", async () => {
    currentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/user/auction-states/route");
    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=1"));
    expect(response.status).toBe(401);
    expect(updateHeartbeat).not.toHaveBeenCalled();
  });

  it("rejects a missing league id", async () => {
    const { GET } = await import("@/app/api/user/auction-states/route");
    const response = await GET(new Request("https://app.test/api/user/auction-states"));
    expect(response.status).toBe(400);
  });

  it("persists presence without activating timers (viewed-only invariant)", async () => {
    const { GET } = await import("@/app/api/user/auction-states/route");
    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=7"));
    expect(response.status).toBe(200);
    expect(updateHeartbeat).toHaveBeenCalledWith("user-a");
    // PR A (re-audit 2026-08-09): il poll NON deve più attivare i timer.
    // L'attivazione avviene solo via response-timer/viewed dopo la view reale.
    expect(activateTimersForUser).not.toHaveBeenCalled();
    const sqlCalls = execute.mock.calls.map(([query]) => query.sql as string);
    expect(sqlCalls.some((sql) => /UPDATE\s+user_auction_response_timers\s+SET[\s\S]*response_deadline/i.test(sql))).toBe(false);
  });

  it("keeps pending timers without a fabricated deadline", async () => {
    execute.mockResolvedValueOnce({ rows: [{ auction_id: 9, player_id: 99, player_name: "Player", player_photo_url: null, current_highest_bidder_id: "user-b", current_highest_bid_amount: 10, response_deadline: null, activated_at: null, cooldown_ends_at: null }] });
    const { GET } = await import("@/app/api/user/auction-states/route");
    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=7"));
    const body = await response.json();
    expect(body.states[0].response_deadline).toBeNull();
    expect(body.states[0].time_remaining).toBeNull();
  });

  it("closes the session through the inactivity API", async () => {
    const { POST } = await import("@/app/api/user/set-inactive/route");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(recordUserLogout).toHaveBeenCalledWith("user-a");
  });

  it("rejects unauthenticated inactivity", async () => {
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/user/set-inactive/route");
    const response = await POST();
    expect(response.status).toBe(401);
    expect(recordUserLogout).not.toHaveBeenCalled();
  });
});
