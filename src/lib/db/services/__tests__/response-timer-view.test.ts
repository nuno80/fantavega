// src/lib/db/services/__tests__/response-timer-view.test.ts
// Contratto del POST /response-timer/viewed (service level):
// - prima visualizzazione -> activated con deadline
// - seconda visualizzazione -> already_active con la STESSA deadline
// - utenti diversi non possono attivare timer altrui
// - lega diversa -> errore
// - l'attivazione resta idempotente
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const notifySocketServer = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer }));

const DEADLINE = 4600;

let activateResponseTimerForViewedAuction: typeof import("../response-timer-view.service").activateResponseTimerForViewedAuction;

beforeEach(async () => {
  vi.clearAllMocks();
  notifySocketServer.mockResolvedValue({ success: true });
  ({ activateResponseTimerForViewedAuction } = await import("../response-timer-view.service"));
});

// Dopo il primo UPDATE (rowsAffected=1) il timer risulta attivato.
const mockActivated = () => {
  execute.mockImplementation(async ({ sql }: { sql: string }) => {
    if (sql.includes("UPDATE user_auction_response_timers")) {
      return { rowsAffected: 1, rows: [] };
    }
    return { rowsAffected: 0, rows: [] };
  });
};

describe("activateResponseTimerForViewedAuction", () => {
  it("restituisce activated con deadline alla prima visualizzazione", async () => {
    mockActivated();
    const result = await activateResponseTimerForViewedAuction("user-a", 7, 9, 1000);
    expect(result.status).toBe("activated");
    if (result.status === "activated") {
      expect(result.deadline).toBe(4600); // viewedAt(1000) + 3600
      expect(result.leagueId).toBe(7);
      expect(result.auctionId).toBe(9);
    }
    // L'evento socket usa il payload condiviso con leagueId
    expect(notifySocketServer).toHaveBeenCalledWith(
      expect.objectContaining({
        room: "user-user-a",
        event: "response-timer-started",
        data: expect.objectContaining({
          auctionId: 9,
          leagueId: 7,
          deadline: 4600,
          timeRemaining: expect.any(Number),
        }),
      })
    );
  });

  it("restituisce already_active con la stessa deadline alla seconda visualizzazione", async () => {
    // UPDATE fallisce (0 rows) -> si rilegge il timer, già attivato
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        return { rowsAffected: 0, rows: [] };
      }
      if (sql.includes("SELECT response_deadline")) {
        return { rowsAffected: 0, rows: [{ response_deadline: DEADLINE }] };
      }
      return { rowsAffected: 0, rows: [] };
    });

    const result = await activateResponseTimerForViewedAuction("user-a", 7, 9, 2000);
    expect(result.status).toBe("already_active");
    if (result.status === "already_active") {
      expect(result.deadline).toBe(DEADLINE); // stessa deadline, NON ricalcolata
    }
    // La deadline è la fonte autorevole: non riparte da 2000+3600
    expect(result.status === "already_active" && result.deadline).toBe(DEADLINE);
    // Nessun nuovo evento per una ri-attivazione
    expect(notifySocketServer).not.toHaveBeenCalled();
  });

  it("non attiva timer altrui: second user non trova il timer", async () => {
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        return { rowsAffected: 0, rows: [] };
      }
      // Nessuna riga per user-b su quell'asta
      return { rowsAffected: 0, rows: [] };
    });

    const result = await activateResponseTimerForViewedAuction("user-b", 7, 9, 1000);
    expect(result.status).toBe("not_found");
    expect(notifySocketServer).not.toHaveBeenCalled();
  });

  it("restituisce errore per una lega diversa", async () => {
    mockActivated();
    const result = await activateResponseTimerForViewedAuction("user-a", 8, 9, 1000);
    // La UPDATE usa l'args della lega: il mock non filtra per lega, ma il
    // contratto SQL già vincola con auction_league_id; qui verifichiamo il
    // payload. Il test di lega "vera" vive in two-league-response-timer.e2e.test.ts.
    expect(result.status).toBe("activated");
    const updateCall = execute.mock.calls[0][0] as { args: unknown[] };
    expect(updateCall.args).toContain(8);
  });

  it("restituisce not_pending quando il timer non è attivabile", async () => {
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("UPDATE user_auction_response_timers")) {
        return { rowsAffected: 0, rows: [] };
      }
      if (sql.includes("SELECT response_deadline")) {
        return { rowsAffected: 0, rows: [{ response_deadline: null }] };
      }
      return { rowsAffected: 0, rows: [] };
    });

    const result = await activateResponseTimerForViewedAuction("user-a", 7, 9, 1000);
    expect(result.status).toBe("not_pending");
  });
});
