import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.fn();
const auth = vi.fn();
const execute = vi.fn();
const updateHeartbeat = vi.fn();
const activateTimersForUser = vi.fn();
const recordUserLogout = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ currentUser, auth }));
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/db/services/session.service", () => ({
  updateHeartbeat,
  recordUserLogout,
}));
vi.mock("@/lib/db/services/response-timer.service", () => ({
  activateTimersForUser,
}));

describe("ghost-session API flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({ id: "user-a" });
    auth.mockResolvedValue({ userId: "user-a" });
    updateHeartbeat.mockResolvedValue(1_000);
    activateTimersForUser.mockResolvedValue(undefined);
    recordUserLogout.mockResolvedValue(undefined);
    execute.mockResolvedValue({ rows: [], rowsAffected: 1 });
  });

  it("rejects an unauthenticated auction-state request", async () => {
    currentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/user/auction-states/route");

    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=1"));

    expect(response.status).toBe(401);
    expect(updateHeartbeat).not.toHaveBeenCalled();
    expect(activateTimersForUser).not.toHaveBeenCalled();
  });

  it("rejects a request without a league id", async () => {
    const { GET } = await import("@/app/api/user/auction-states/route");

    const response = await GET(new Request("https://app.test/api/user/auction-states"));

    expect(response.status).toBe(400);
    expect(updateHeartbeat).not.toHaveBeenCalled();
  });

  it("updates liveness and activates pending timers when the user returns", async () => {
    const { GET } = await import("@/app/api/user/auction-states/route");

    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=7"));
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(updateHeartbeat).toHaveBeenCalledWith("user-a");
    expect(activateTimersForUser).toHaveBeenCalledWith("user-a", 1000);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      args: ["user-a", "user-a", "user-a", expect.any(Number), "7"],
    }));
  });

  it("keeps a ghost timer pending until the return request activates it", async () => {
    execute.mockResolvedValueOnce({
      rows: [{
        auction_id: 9,
        player_id: 99,
        player_name: "Player",
        player_photo_url: null,
        current_highest_bidder_id: "user-b",
        current_highest_bid_amount: 10,
        response_deadline: null,
        activated_at: null,
        cooldown_ends_at: null,
      }],
    });

    const { GET } = await import("@/app/api/user/auction-states/route");
    const response = await GET(new Request("https://app.test/api/user/auction-states?leagueId=7"));
    const body = await response.json();

    expect(body.states).toHaveLength(1);
    expect(body.states[0].response_deadline).toBeNull();
    expect(body.states[0].time_remaining).toBeNull();
    expect(activateTimersForUser).toHaveBeenCalledWith("user-a", 1000);
  });

  it("closes the session through the inactivity API", async () => {
    const { POST } = await import("@/app/api/user/set-inactive/route");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(recordUserLogout).toHaveBeenCalledWith("user-a");
  });

  it("does not close a session for an unauthenticated inactivity request", async () => {
    auth.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/user/set-inactive/route");

    const response = await POST();

    expect(response.status).toBe(401);
    expect(recordUserLogout).not.toHaveBeenCalled();
  });
});
