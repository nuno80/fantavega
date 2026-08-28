import { beforeEach, describe, expect, it, vi } from "vitest";

// Matrice di autorizzazione SEC-005: ogni route di lettura/mutazione di lega
// deve passare da hasLeagueAccess (partecipanti + admin) prima di toccare i dati.

const currentUser = vi.fn();
const auth = vi.fn();
const hasLeagueAccess = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ currentUser, auth }));
vi.mock("@/lib/auth/league-guard", () => ({ hasLeagueAccess }));
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/db/services/bid.service", () => ({ getAuctionStatusForPlayer: vi.fn() }));
vi.mock("@/lib/db/services/auction-league.service", () => ({ getManagerRoster: vi.fn() }));
vi.mock("@/lib/db/services/penalty.service", () => ({ processUserComplianceAndPenalties: vi.fn() }));
vi.mock("@/lib/db/services/response-timer.service", () => ({ abandonAuction: vi.fn() }));
vi.mock("@/lib/db/services/player-discard.service", () => ({ discardPlayerFromRoster: vi.fn() }));

function ctx(leagueId: number, extra: Record<string, string> = {}) {
  return { params: Promise.resolve({ "league-id": String(leagueId), ...extra }) } as never;
}

const routes: Array<{
  name: string;
  method: string;
  call: () => Promise<Response>;
}> = [];

describe("SEC-005 league read policy matrix", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({ id: "user-1", publicMetadata: { role: "manager" } });
    auth.mockResolvedValue({ userId: "user-1" });
    hasLeagueAccess.mockResolvedValue(false);
  });

  for (const method of ["GET", "POST"]) {
    routes.push({
      name: `bids ${method}`,
      method,
      call: async () => {
        const mod = await import("@/app/api/leagues/[league-id]/players/[player-id]/bids/route");
        const handler = method === "GET" ? mod.GET : mod.POST;
        return handler(
          new Request("https://app.test", { method: "POST", body: JSON.stringify({ amount: 10 }) }),
          { params: Promise.resolve({ "league-id": "7", "player-id": "42" }) },
        );
      },
    });
  }

  routes.push(
    { name: "current-auction GET", method: "GET", call: async () => {
      const { GET } = await import("@/app/api/leagues/[league-id]/current-auction/route");
      return GET(new Request("https://app.test") as never, ctx(7));
    } },
    { name: "managers GET", method: "GET", call: async () => {
      const { GET } = await import("@/app/api/leagues/[league-id]/managers/route");
      return GET(new Request("https://app.test") as never, ctx(7));
    } },
    { name: "roster GET", method: "GET", call: async () => {
      const { GET } = await import("@/app/api/leagues/[league-id]/managers/[manager-user-id]/roster/route");
      return GET(new Request("https://app.test") as never, { params: Promise.resolve({ "league-id": "7", "manager-user-id": "user-2" }) });
    } },
    { name: "all-compliance-status GET", method: "GET", call: async () => {
      const { GET } = await import("@/app/api/leagues/[league-id]/all-compliance-status/route");
      return GET(new Request("https://app.test") as never, ctx(7));
    } },
    { name: "check-compliance POST", method: "POST", call: async () => {
      const { POST } = await import("@/app/api/leagues/[league-id]/check-compliance/route");
      return POST(new Request("https://app.test", { method: "POST", body: "{}" }), ctx(7));
    } },
    { name: "abandon POST", method: "POST", call: async () => {
      const { POST } = await import("@/app/api/leagues/[league-id]/players/[player-id]/abandon/route");
      return POST(new Request("https://app.test", { method: "POST" }) as never, ctx(7, { "player-id": "42" }));
    } },
    { name: "discard-player POST", method: "POST", call: async () => {
      const { POST } = await import("@/app/api/leagues/[league-id]/discard-player/route");
      return POST(new Request("https://app.test", { method: "POST", body: JSON.stringify({ playerId: 42 }) }) as never, ctx(7));
    } },
    { name: "budget GET", method: "GET", call: async () => {
      const { GET } = await import("@/app/api/leagues/[league-id]/budget/route");
      return GET(new Request("https://app.test") as never, ctx(7));
    } },
  );

  it.each(routes)("$name: 403 per non membri senza leggere dati", async ({ call }) => {
    const response = await call();
    expect(response.status).toBe(403);
  });

  it.each(routes)("$name: supera il guard per un membro", async ({ call }) => {
    hasLeagueAccess.mockResolvedValue(true);
    await call();
    expect(hasLeagueAccess).toHaveBeenCalled();
  });
});
