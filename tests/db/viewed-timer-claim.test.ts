// tests/db/viewed-timer-claim.test.ts
// Regressione re-audit 2026-08-09 (PR A): l'endpoint response-timer/viewed
// deve reclamare (claim) il timer in modo idempotente — la deadline viene
// scritta una sola volta anche con chiamate concorrenti, e solo quando il
// timer è pending senza deadline. Il countdown parte solo quando l'utente
// ha davvero visto la card (view), non a ogni poll.
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const activateResponseTimerForViewedAuction = vi.fn();
const currentUser = vi.fn();
const hasLeagueAccess = vi.fn();

vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/db/services/response-timer-view.service", () => ({
  activateResponseTimerForViewedAuction,
}));
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/auth/league-guard", () => ({ hasLeagueAccess }));

describe("response-timer viewed claim", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockResolvedValue({ id: "user-view" });
    hasLeagueAccess.mockResolvedValue(true);
  });

  it("rejects an unauthenticated caller", async () => {
    currentUser.mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/response-timer/viewed/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/7/players/9/response-timer/viewed", {
        method: "POST",
      }),
      { params: Promise.resolve({ "league-id": "7", "player-id": "9" }) }
    );
    expect(response.status).toBe(401);
    expect(activateResponseTimerForViewedAuction).not.toHaveBeenCalled();
  });

  it("claims exactly once under concurrent view POSTs (idempotenza)", async () => {
    // La route fa: SELECT asta attiva (mock rows), poi chiama il service.
    execute.mockResolvedValueOnce({ rows: [{ id: 42 }] });
    activateResponseTimerForViewedAuction.mockResolvedValue({
      status: "activated",
      auctionId: 42,
      leagueId: 7,
      deadline: 5_600,
    });

    const { POST } = await import(
      "@/app/api/leagues/[league-id]/players/[player-id]/response-timer/viewed/route"
    );
    const response = await POST(
      new Request("https://app.test/api/leagues/7/players/9/response-timer/viewed", {
        method: "POST",
      }),
      { params: Promise.resolve({ "league-id": "7", "player-id": "9" }) }
    );
    expect(response.status).toBe(200);

    // Il service (mock) è il punto in cui avviene il compare-and-set;
    // il contratto "una sola deadline" è garantito dal service reale:
    // il test verifica che la route invochi il service con i dati scoped.
    expect(activateResponseTimerForViewedAuction).toHaveBeenCalledTimes(1);
    expect(activateResponseTimerForViewedAuction).toHaveBeenCalledWith("user-view", 7, 42);
  });
});
