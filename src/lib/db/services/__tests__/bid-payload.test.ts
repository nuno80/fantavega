// src/lib/db/services/__tests__/bid-payload.test.ts
// Verifica che il payload dell'evento socket `auction-update` sia arricchito
// con il nome squadra del miglior offerente (highestBidderName) e gli auto-bid attivi.
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

// Mock del socket emitter: catturiamo le emissioni per ispezionarle
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

import { placeBidOnExistingAuction } from "../bid.service";

describe("placeBidOnExistingAuction - payload auction-update", () => {
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
    // Fuori transazione: risposta deterministica basata sull'SQL (immune all'ordine delle chiamate)
    mockExecute.mockImplementation((args: unknown) => {
      const sql = (args as { sql?: string })?.sql || "";
      if (sql.includes("COALESCE(lp.manager_team_name"))
        return Promise.resolve({ rows: [{ team_name: "Squadra Test" }] }); // highestBidderName
      if (sql.includes("FROM auto_bids ab"))
        return Promise.resolve({
          rows: [{ userId: "user_autobid", username: "AutoBidder", maxAmount: 50, isActive: true }],
        }); // activeAutoBidsPayload
      if (sql.includes("FROM bids")) return Promise.resolve({ rows: [] }); // lastBid → nessuna riga
      if (sql.includes("FROM auctions")) return Promise.resolve({ rows: [{ id: 100 }] }); // auctionInfoForBid/Cancel
      return Promise.resolve({ rows: [{ current_budget: 470, locked_credits: 30 }] }); // budget/compliance
    });
  });

  const auctionRow = {
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
  };

  const participantRow = {
    user_id: TEST_USER_ID,
    current_budget: 500,
    locked_credits: 10,
    players_P_acquired: 0,
    players_D_acquired: 0,
    players_C_acquired: 0,
    players_A_acquired: 0,
  };

  it("include highestBidderName (nome squadra) nel payload auction-update", async () => {
    // Sequenza completa di tx.execute (nessun default misto - solo Once)
    mockTxExecute.mockResolvedValueOnce({ rows: [auctionRow] }); // 1. combinedData
    mockTxExecute.mockResolvedValueOnce({ rows: [participantRow] }); // 2. participant
    // checkSlotsAndBudgetOrThrow (chiamata 1: bidder): 3 query
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] }); // 3a. activeWinningBids totale
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] }); // 3b. count assigned per ruolo
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] }); // 3c. count active bids per ruolo
    mockTxExecute.mockResolvedValueOnce({ rows: [] }); // 4. allActiveAutoBids (nessuno)
    mockTxExecute.mockResolvedValueOnce({ rows: [participantRow] }); // 5. finalWinnerParticipant
    // checkSlotsAndBudgetOrThrow (chiamata 2: final winner): 3 query
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 }); // 6. update auction
    mockTxExecute.mockResolvedValueOnce({ rows: [] }); // 7. outbidAutoBids (nessuno)
    // 8-11. ricalcolo locked_credits per 2 utenti (finalBidder + previous)
    mockTxExecute.mockResolvedValueOnce({ rows: [{ total_locked: 30 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ total_locked: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 }); // 12. INSERT bid finale
    mockTxExecute.mockResolvedValueOnce({ rows: [{ name: "Attaccante Test" }] }); // 13. playerName

    await placeBidOnExistingAuction({
      leagueId: TEST_LEAGUE_ID,
      userId: TEST_USER_ID,
      playerId: TEST_PLAYER_ID,
      bidAmount: TEST_AMOUNT,
    });

    // Trova l'emissione auction-update
    const auctionUpdateCall = mockNotifySocketServer.mock.calls.find(
      ([params]) => params.event === "auction-update"
    );
    expect(auctionUpdateCall).toBeDefined();
    const payload = auctionUpdateCall![0].data;

    expect(payload.playerId).toBe(TEST_PLAYER_ID);
    expect(payload.newPrice).toBe(TEST_AMOUNT);
    expect(payload.highestBidderId).toBe(TEST_USER_ID);
    // Nome squadra risolto dal backend
    expect(payload.highestBidderName).toBe("Squadra Test");
    expect(payload.scheduledEndTime).toBeDefined();
  });

  it("include autoBids attivi nel payload auction-update", async () => {
    // Sequenza completa di tx.execute (solo Once)
    mockTxExecute.mockResolvedValueOnce({ rows: [auctionRow] }); // 1. combinedData
    mockTxExecute.mockResolvedValueOnce({ rows: [participantRow] }); // 2. participant
    // checkSlotsAndBudgetOrThrow (chiamata 1): 3 query
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [] }); // 4. allActiveAutoBids
    mockTxExecute.mockResolvedValueOnce({ rows: [participantRow] }); // 5. finalWinnerParticipant
    // checkSlotsAndBudgetOrThrow (chiamata 2): 3 query
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 }); // 6. update auction
    mockTxExecute.mockResolvedValueOnce({ rows: [] }); // 7. outbidAutoBids
    mockTxExecute.mockResolvedValueOnce({ rows: [{ total_locked: 30 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 });
    mockTxExecute.mockResolvedValueOnce({ rows: [{ total_locked: 0 }] });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 });
    mockTxExecute.mockResolvedValueOnce({ rowsAffected: 1 }); // 12. INSERT bid
    mockTxExecute.mockResolvedValueOnce({ rows: [{ name: "Attaccante Test" }] }); // 13. playerName

    await placeBidOnExistingAuction({
      leagueId: TEST_LEAGUE_ID,
      userId: TEST_USER_ID,
      playerId: TEST_PLAYER_ID,
      bidAmount: TEST_AMOUNT,
    });

    const auctionUpdateCall = mockNotifySocketServer.mock.calls.find(
      ([params]) => params.event === "auction-update"
    );
    expect(auctionUpdateCall).toBeDefined();
    const payload = auctionUpdateCall![0].data;

    expect(payload.autoBids).toBeDefined();
    expect(payload.autoBids).toEqual([
      { userId: "user_autobid", username: "AutoBidder", maxAmount: 50, isActive: true },
    ]);
  });
});
