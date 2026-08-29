import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, getPlayers, getUserActiveCooldowns, hasLeagueAccess } =
  vi.hoisted(() => ({
    currentUser: vi.fn(),
    getPlayers: vi.fn(),
    getUserActiveCooldowns: vi.fn(),
    hasLeagueAccess: vi.fn(),
  }));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/auth/league-guard", () => ({ hasLeagueAccess }));
vi.mock("@/lib/db/services/player.service", () => ({ getPlayers }));
vi.mock("@/lib/db/services/response-timer.service", () => ({
  getUserActiveCooldowns,
}));

function request(query = "") {
  return { nextUrl: new URL(`https://app.test/api/players${query}`) } as never;
}

describe("GET /api/players authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({
      id: "user-1",
      publicMetadata: { role: "manager" },
    });
    getPlayers.mockResolvedValue({
      players: [],
      totalPlayers: 0,
      page: 1,
      limit: 25,
      totalPages: 0,
    });
    getUserActiveCooldowns.mockResolvedValue(new Map());
    hasLeagueAccess.mockResolvedValue(true);
  });

  it("returns 401 when the handler is reached without authentication", async () => {
    currentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/players/route");

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(getPlayers).not.toHaveBeenCalled();
  });

  it("keeps the general catalog available to authenticated users", async () => {
    const { GET } = await import("@/app/api/players/route");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(hasLeagueAccess).not.toHaveBeenCalled();
    expect(getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" })
    );
  });

  it("returns 403 before loading another league's auction state", async () => {
    hasLeagueAccess.mockResolvedValue(false);
    const { GET } = await import("@/app/api/players/route");

    const response = await GET(request("?leagueId=42"));

    expect(response.status).toBe(403);
    expect(hasLeagueAccess).toHaveBeenCalledWith("user-1", 42, "manager");
    expect(getPlayers).not.toHaveBeenCalled();
    expect(getUserActiveCooldowns).not.toHaveBeenCalled();
  });

  it("loads league-specific state for a member", async () => {
    const { GET } = await import("@/app/api/players/route");

    const response = await GET(request("?leagueId=42"));

    expect(response.status).toBe(200);
    expect(getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 42, userId: "user-1" })
    );
  });

  it.each(["42junk", "0", "-1", "1.5", ""])(
    "rejects malformed leagueId=%s without partially parsing it",
    async (leagueId) => {
      const { GET } = await import("@/app/api/players/route");

      const response = await GET(request(`?leagueId=${leagueId}`));

      expect(response.status).toBe(400);
      expect(hasLeagueAccess).not.toHaveBeenCalled();
      expect(getPlayers).not.toHaveBeenCalled();
    }
  );
});
