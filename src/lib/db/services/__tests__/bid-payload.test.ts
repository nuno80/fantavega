// src/lib/db/services/__tests__/bid-payload.test.ts
// Verifica che l'evento essenziale `auction-update` venga inserito nell'outbox
// NELLA stessa transazione del bid, con un payload arricchito: nome squadra del
// miglior offerente, budget updates coerenti col commit e il newBid appena scritto.
// REL-006: la delivery Socket.IO è disaccoppiata; qui asseriamo il contratto outbox.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Variabili mock hoisted per essere usate nei factory di vi.mock
const { mockExecute, mockTransaction } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockTransaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: mockTransaction,
  },
}));

// Mock del socket emitter: non deve essere più chiamato direttamente dal bid path.
const { mockNotifySocketServer } = vi.hoisted(() => ({
  mockNotifySocketServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: mockNotifySocketServer,
}));

// Evita che il modulo importi altri servizi non mockati
vi.mock("../response-timer.service", () => ({
  getUserCooldownInfo: vi.fn().mockResolvedValue({ canBid: true, message: null }),
  cancelResponseTimer: vi.fn().mockResolvedValue(undefined),
  createResponseTimer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../auction-states.service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auction-states.service")>();
  return {
    ...original,
    // setUserAuctionStateInTx è reale (scrive su user_auction_states via tx).
  };
});

import { placeBidOnExistingAuction } from "../bid.service";

describe("placeBidOnExistingAuction - outbox payload auction-update", () => {
  const TEST_USER_ID = "user_bidder";
  const TEST_LEAGUE_ID = 8;
  const TEST_PLAYER_ID = 42;
  const TEST_AMOUNT = 30;

  // Mock della transazione: stesso oggetto per tx.execute
  const mockTxExecute = vi.fn();
  const mockRollback = vi.fn().mockResolvedValue(undefined);
  const mockCommit = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifySocketServer.mockClear();
    mockTxExecute.mockReset();

    // Simula db.transaction restituendo una tx mockata
    mockTransaction.mockResolvedValue({
      execute: mockTxExecute,
      commit: mockCommit,
      rollback: mockRollback,
    });

    // Risposta deterministica basata sull'SQL (immune all'ordine delle chiamate).
    // tx.execute può essere chiamato N volte con SQL diversi; rispondiamo per substring.
    mockTxExecute.mockImplementation((args: unknown) => {
      const sql = (args as { sql?: string })?.sql || "";
      // 1. combinedData (auction + league + player join)
      if (sql.includes("FROM auctions a") && sql.includes("JOIN auction_leagues al")) {
        return Promise.resolve({
          rows: [{
            auction_id: 100,
            current_highest_bid_amount: 20,
            current_highest_bidder_id: "user_previous",
            scheduled_end_time: Math.floor(Date.now() / 1000) + 600,
            user_auction_states: null,
            league_id: TEST_LEAGUE_ID,
            league_status: "draft_active",
            active_auction_roles: "ALL",
            min_bid: 1,
            timer_duration_minutes: 2,
            slots_P: 3,
            slots_D: 8,
            slots_C: 8,
            slots_A: 6,
            player_id: TEST_PLAYER_ID,
            player_role: "A",
          }],
        });
      }
      // 2. budget update SELECT (solo current_budget, locked_credits) — prima del participant generico
      if (sql.includes("SELECT current_budget, locked_credits")) {
        return Promise.resolve({ rows: [{ current_budget: 470, locked_credits: 30 }] });
      }
      // 2b. participant (SELECT ... FROM league_participants WHERE league_id AND user_id)
      if (sql.includes("FROM league_participants WHERE league_id")) {
        return Promise.resolve({
          rows: [{
            user_id: TEST_USER_ID,
            current_budget: 500,
            locked_credits: 10,
            players_P_acquired: 0,
            players_D_acquired: 0,
            players_C_acquired: 0,
            players_A_acquired: 0,
          }],
        });
      }
      // 3. checkSlotsAndBudgetOrThrow: COUNT queries (both COUNT(*) and COUNT(DISTINCT))
      if (sql.includes("COUNT(")) {
        return Promise.resolve({ rows: [{ count: 0 }] });
      }
      // locked credits recalc SELECT (contains "as total_locked") — before generic auto_bids
      if (sql.includes("as total_locked")) {
        return Promise.resolve({ rows: [{ total_locked: 0 }] });
      }
      // 4. allActiveAutoBids (auto_bids WHERE auction_id AND is_active, no JOIN users)
      if (sql.includes("FROM auto_bids") && !sql.includes("JOIN users")) {
        return Promise.resolve({ rows: [] });
      }
      // 5. INSERT bid finale RETURNING id
      if (sql.includes("INSERT INTO bids")) {
        return Promise.resolve({ rows: [{ id: 999 }] });
      }
      // 6. setUserAuctionStateInTx: SELECT user_auction_states FROM auctions WHERE id
      if (sql.includes("user_auction_states") && sql.includes("SELECT")) {
        return Promise.resolve({ rows: [{ user_auction_states: null, current_highest_bidder_id: "user_bidder", player_id: TEST_PLAYER_ID }] });
      }
      // 7. playerName SELECT name FROM players
      if (sql.includes("SELECT name FROM players")) {
        return Promise.resolve({ rows: [{ name: "Attaccante Test" }] });
      }
      // 8. winnerTeamNameResult (COALESCE manager_team_name)
      if (sql.includes("COALESCE(lp.manager_team_name")) {
        return Promise.resolve({ rows: [{ team_name: "Squadra Test", username: "BidderUser" }] });
      }
      // 10. event_outbox INSERT (captured below by assertion on sql)
      if (sql.includes("INSERT INTO event_outbox")) {
        return Promise.resolve({ rowsAffected: 1, rows: [] });
      }
      // 11. UPDATE auctions (setUserAuctionStateInTx write)
      if (sql.includes("UPDATE auctions")) {
        return Promise.resolve({ rowsAffected: 1 });
      }
      // 12. UPDATE league_participants (recalc locked credits)
      if (sql.includes("UPDATE league_participants")) {
        return Promise.resolve({ rowsAffected: 1 });
      }
      return Promise.resolve({ rows: [], rowsAffected: 0 });
    });
  });

  it("inserisce l'evento auction-update nell'outbox con nome squadra e budget coerenti", async () => {
    await placeBidOnExistingAuction({
      leagueId: TEST_LEAGUE_ID,
      userId: TEST_USER_ID,
      playerId: TEST_PLAYER_ID,
      bidAmount: TEST_AMOUNT,
    });

    // L'evento essenziale va nell'outbox (INSERT), non in notifySocketServer.
    const outboxCall = mockTxExecute.mock.calls.find(([args]) =>
      (args as { sql?: string })?.sql?.includes("INSERT INTO event_outbox")
    );
    expect(outboxCall).toBeDefined();

    const args = outboxCall![0] as { args: unknown[] };
    // args: [event_id, event_type, room, event_name, payload, essential, status(no), next_attempt_at, created_at]
    const [eventId, eventType, room, eventName, payloadJson] = args.args;
    expect(eventId).toEqual(expect.any(String));
    expect(eventType).toBe("auction-update");
    expect(room).toBe(`league-${TEST_LEAGUE_ID}`);
    expect(eventName).toBe("auction-update");

    const payload = JSON.parse(payloadJson as string) as Record<string, unknown>;
    expect(payload.playerId).toBe(TEST_PLAYER_ID);
    expect(payload.newPrice).toBe(TEST_AMOUNT);
    expect(payload.highestBidderId).toBe(TEST_USER_ID);
    expect(payload.highestBidderName).toBe("Squadra Test");
    expect(payload.scheduledEndTime).toBeDefined();
    // newBid appena scritto con id 999.
    expect((payload.newBid as { id: number }).id).toBe(999);
    // B2: il payload pubblico NON contiene dati finanziari personali.
    for (const key of ["budgetUpdates", "lockedCredits", "newLockedCredits", "autoBids", "maxAmount"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("inserisce un evento privato per l'utente coinvolto, con budget e locked credits", async () => {
    await placeBidOnExistingAuction({
      leagueId: TEST_LEAGUE_ID,
      userId: TEST_USER_ID,
      playerId: TEST_PLAYER_ID,
      bidAmount: TEST_AMOUNT,
    });

    const privateCall = mockTxExecute.mock.calls.find(([args]) => {
      const sql = (args as { sql?: string })?.sql ?? "";
      if (!sql.includes("INSERT INTO event_outbox")) return false;
      const rowArgs = (args as { args: unknown[] }).args;
      return rowArgs[1] === "user-auction-private-update";
    });
    expect(privateCall).toBeDefined();

    const rowArgs = (privateCall![0] as { args: unknown[] }).args;
    expect(rowArgs[2]).toBe(`user-${TEST_USER_ID}`); // room
    expect(rowArgs[3]).toBe("user-auction-private-update"); // event name

    const payload = JSON.parse(rowArgs[4] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      leagueId: TEST_LEAGUE_ID,
      playerId: TEST_PLAYER_ID,
      currentBudget: 470,
      lockedCredits: 30,
    });
  });

  it("non chiama notifySocketServer direttamente dal path bid", async () => {
    await placeBidOnExistingAuction({
      leagueId: TEST_LEAGUE_ID,
      userId: TEST_USER_ID,
      playerId: TEST_PLAYER_ID,
      bidAmount: TEST_AMOUNT,
    });
    // Le notifiche individuali sono best-effort e qui non ci sono utenti superati
    // diversi dal vincitore (previous=user_previous, final=user_bidder), quindi
    // bid-surpassed-notification parte, ma va via publishBestEffortEvent →
    // notifySocketServer. Asseriamo solo che NON parta auction-update diretto.
    const auctionUpdateDirect = mockNotifySocketServer.mock.calls.find(([params]) =>
      params.event === "auction-update"
    );
    expect(auctionUpdateDirect).toBeUndefined();
  });
});
