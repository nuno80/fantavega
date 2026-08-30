import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

// B1: contratti realtime dell'asta. L'evento pubblico `auction-update` su
// league-* NON deve contenere dati finanziari personali; i dati privati
// (budget, locked credits, massimale auto-bid) viaggiano solo su user-${userId}
// con l'evento dedicato `user-auction-private-update`, sempre via outbox.

const currentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    execute: (input: Parameters<Client["execute"]>[0]) => client.execute(input),
  },
}));

let client: Client;

afterEach(async () => {
  if (client) await client.close();
});

async function seededClient() {
  client = createClient({ url: "file::memory:" });
  await deployDatabaseSchema(client);
  return client;
}

const FORBIDDEN_PUBLIC_KEYS = [
  "budgetUpdates",
  "locked_credits",
  "lockedCredits",
  "newLockedCredits",
  "autoBids",
  "maxAmount",
];

describe("B1 auction realtime contracts", () => {
  it("pubblica auction-update su league-* con solo campi pubblici", async () => {
    const c = await seededClient();
    const { publishAuctionUpdate } = await import("@/lib/db/services/event-publisher");

    await publishAuctionUpdate(c, 1, {
      playerId: 7,
      newPrice: 25,
      highestBidderId: "alice",
      highestBidderName: "Squadra Alice",
      scheduledEndTime: 1234,
      newBid: { id: 99, user_id: "alice", amount: 25, bid_time: "2024-01-01T00:00:00Z" },
    });

    const result = await c.execute({
      sql: "SELECT event_type, room, event_name, payload, essential FROM event_outbox",
      args: [],
    });
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.event_type).toBe("auction-update");
    expect(row.room).toBe("league-1");
    expect(row.event_name).toBe("auction-update");
    expect(Number(row.essential)).toBe(1);

    const payload = JSON.parse(String(row.payload)) as Record<string, unknown>;
    expect(payload).toEqual({
      playerId: 7,
      newPrice: 25,
      highestBidderId: "alice",
      highestBidderName: "Squadra Alice",
      scheduledEndTime: 1234,
      newBid: { id: 99, user_id: "alice", amount: 25, bid_time: "2024-01-01T00:00:00Z" },
    });
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it("pubblica user-auction-private-update solo su user-${userId}", async () => {
    const c = await seededClient();
    const { publishPrivateAuctionUpdate } = await import("@/lib/db/services/event-publisher");

    await publishPrivateAuctionUpdate(c, "alice", {
      leagueId: 1,
      playerId: 7,
      currentBudget: 100,
      lockedCredits: 20,
      autoBid: { maxAmount: 50, isActive: true },
    });

    const result = await c.execute({
      sql: "SELECT event_type, room, event_name, payload FROM event_outbox",
      args: [],
    });
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.event_type).toBe("user-auction-private-update");
    expect(row.room).toBe("user-alice");
    expect(row.event_name).toBe("user-auction-private-update");

    const payload = JSON.parse(String(row.payload)) as Record<string, unknown>;
    expect(payload).toEqual({
      leagueId: 1,
      playerId: 7,
      currentBudget: 100,
      lockedCredits: 20,
      autoBid: { maxAmount: 50, isActive: true },
    });
  });
});
