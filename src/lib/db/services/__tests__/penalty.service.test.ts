// src/lib/db/services/__tests__/penalty.service.test.ts
// Test per il fix del compliance timer - verifica che startTimerIfNonCompliant funzioni correttamente
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock del modulo db
const mockExecute = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

// Mock del socket emitter
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

// Mock del tipo AuctionLeague
vi.mock("./auction-league.service", () => ({}));

import { checkAndRecordCompliance } from "../penalty.service";

describe("checkAndRecordCompliance - startTimerIfNonCompliant", () => {
  const TEST_USER_ID = "user_test_123";
  const TEST_LEAGUE_ID = 8;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper per configurare una lega in draft_active con ruoli attivi
  const setupLeagueAndNonCompliantUser = () => {
    // Query 1: Fetch league (draft_active)
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: TEST_LEAGUE_ID,
          status: "draft_active",
          active_auction_roles: "P,D,C,A",
          slots_P: 3,
          slots_D: 8,
          slots_C: 8,
          slots_A: 6,
        },
      ],
    });

    // Query 2: Count assigned players (0 = non-compliant because required is N-1)
    mockExecute.mockResolvedValueOnce({ rows: [] });

    // Query 3: Count active winning bids (0 = even more non-compliant)
    mockExecute.mockResolvedValueOnce({ rows: [] });

    // Query 4: Get existing compliance record (no timer active)
    mockExecute.mockResolvedValueOnce({ rows: [] });

    // Query 5: INSERT new compliance record (no timer)
    mockExecute.mockResolvedValueOnce({ rowsAffected: 1 });
  };

  it("NON deve avviare il timer quando startTimerIfNonCompliant = false (utente offline)", async () => {
    setupLeagueAndNonCompliantUser();

    const result = await checkAndRecordCompliance(
      TEST_USER_ID,
      TEST_LEAGUE_ID,
      false // <-- Server-side trigger, utente potenzialmente offline
    );

    // L'utente è non-compliant
    expect(result.isCompliant).toBe(false);

    // Lo status NON deve essere cambiato (timer non avviato)
    expect(result.statusChanged).toBe(false);

    // Verifica che NON sia stata fatta una UPDATE per avviare il timer
    // Le chiamate al db sono: 1. fetch league, 2. count assigned, 3. count winning bids,
    // 4. get compliance record, 5. insert new record placeholder
    // NON ci deve essere una 6a chiamata con compliance_timer_start_at
    const allCalls = mockExecute.mock.calls;
    const timerStartCalls = allCalls.filter(
      (call) =>
        typeof call[0]?.sql === "string" &&
        call[0].sql.includes("compliance_timer_start_at = ?") &&
        call[0].sql.includes("UPDATE")
    );

    expect(timerStartCalls).toHaveLength(0);
  });

  it("DEVE avviare il timer quando startTimerIfNonCompliant = true (utente online, default)", async () => {
    setupLeagueAndNonCompliantUser();

    // Query 6: UPDATE per avviare il timer (questo deve succedere)
    mockExecute.mockResolvedValueOnce({ rowsAffected: 1 });

    const result = await checkAndRecordCompliance(
      TEST_USER_ID,
      TEST_LEAGUE_ID,
      true // <-- Frontend trigger, utente online
    );

    // L'utente è non-compliant
    expect(result.isCompliant).toBe(false);

    // Lo status DEVE essere cambiato (timer avviato)
    expect(result.statusChanged).toBe(true);

    // Verifica che SIA stata fatta una UPDATE per avviare il timer
    const allCalls = mockExecute.mock.calls;
    const timerStartCalls = allCalls.filter(
      (call) =>
        typeof call[0]?.sql === "string" &&
        call[0].sql.includes("compliance_timer_start_at = ?") &&
        call[0].sql.includes("UPDATE")
    );

    expect(timerStartCalls).toHaveLength(1);
  });

  it("DEVE avviare il timer con il default (senza parametro esplicito)", async () => {
    setupLeagueAndNonCompliantUser();

    // Query 6: UPDATE per avviare il timer
    mockExecute.mockResolvedValueOnce({ rowsAffected: 1 });

    const result = await checkAndRecordCompliance(
      TEST_USER_ID,
      TEST_LEAGUE_ID
      // <-- Nessun terzo parametro, default = true
    );

    expect(result.isCompliant).toBe(false);
    expect(result.statusChanged).toBe(true);
  });

  it("NON deve cambiare comportamento per utenti già compliant", async () => {
    // Query 1: Fetch league (draft_active)
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: TEST_LEAGUE_ID,
          status: "draft_active",
          active_auction_roles: "P,D,C,A",
          slots_P: 3,
          slots_D: 8,
          slots_C: 8,
          slots_A: 6,
        },
      ],
    });

    // Query 2: Count assigned players (abbastanza per essere compliant: N-1)
    mockExecute.mockResolvedValueOnce({
      rows: [
        { role: "P", count: 2 },
        { role: "D", count: 7 },
        { role: "C", count: 7 },
        { role: "A", count: 5 },
      ],
    });

    // Query 3: Count active winning bids
    mockExecute.mockResolvedValueOnce({ rows: [] });

    // Query 4: Get compliance record (no timer)
    mockExecute.mockResolvedValueOnce({
      rows: [{ compliance_timer_start_at: null }],
    });

    const result = await checkAndRecordCompliance(
      TEST_USER_ID,
      TEST_LEAGUE_ID,
      false
    );

    // Utente compliant, nessun cambio di stato indipendentemente dal parametro
    expect(result.isCompliant).toBe(true);
    expect(result.statusChanged).toBe(false);
  });
});
