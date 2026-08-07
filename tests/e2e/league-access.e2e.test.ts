import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.fn();
const hasLeagueAccess = vi.fn();
const execute = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/auth/league-guard", () => ({ hasLeagueAccess }));
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/db/services/session.service", () => ({ updateHeartbeat: vi.fn() }));
vi.mock("@/lib/db/services/response-timer.service", () => ({ activateTimersForUser: vi.fn() }));
vi.mock("@/lib/db/services/bid.service", () => ({ getAuctionStatusForPlayer: vi.fn() }));

describe("league auction-state authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({ id: "user-a", publicMetadata: { role: "manager" } });
    execute.mockResolvedValue({ rows: [] });
  });

  it("returns 403 before reading league data", async () => {
    hasLeagueAccess.mockResolvedValue(false);
    const { GET } = await import("@/app/api/leagues/[league-id]/auction-state/route");
    const response = await GET(new Request("https://app.test") as never, { params: Promise.resolve({ "league-id": "7" }) });
    expect(response.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed league ids before access checks", async () => {
    const { GET } = await import("@/app/api/leagues/[league-id]/auction-state/route");
    const response = await GET(new Request("https://app.test") as never, { params: Promise.resolve({ "league-id": "7x" }) });
    expect(response.status).toBe(400);
    expect(hasLeagueAccess).not.toHaveBeenCalled();
  });
});
