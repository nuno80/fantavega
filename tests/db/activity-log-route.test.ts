import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

// A2: test di integrazione dell'Activity Log con DB reale (libSQL in-memory).
// Il mock sostituisce solo il modulo di connessione: `db.execute` resta
// l'implementazione reale, così gli errori SQL non passano inosservati.

const currentUser = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({
  db: {
    execute: (input: Parameters<Client["execute"]>[0]) => client.execute(input),
  },
}));

let client: Client;

async function seed() {
  client = createClient({ url: "file::memory:" });
  await deployDatabaseSchema(client);
  await client.executeMultiple(`
    INSERT INTO users (id, email, username) VALUES
      ('user-1', 'u1@x.it', 'alice'),
      ('user-2', 'u2@x.it', 'bruno'),
      ('outsider', 'o@x.it', 'carla');
    INSERT INTO players (id, role, name, team, current_quotation, initial_quotation)
      VALUES (1, 'A', 'Attaccante', 'Team', 20, 20);
    INSERT INTO auction_leagues (id, name, initial_budget_per_manager, admin_creator_id)
      VALUES (1, 'liga', 100, 'user-1');
    INSERT INTO league_participants (league_id, user_id, current_budget) VALUES
      (1, 'user-1', 100),
      (1, 'user-2', 100);
    INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time)
      VALUES (1, 1, 1, 1000, 2000);
    INSERT INTO bids (id, auction_id, user_id, amount, bid_time, bid_type) VALUES
      (1, 1, 'user-1', 10, 1100, 'manual'),
      (2, 1, 'user-2', 15, 1200, 'auto'),
      (3, 1, 'user-1', 20, 1300, 'manual'),
      (4, 1, 'user-2', 25, 1400, 'quick'),
      (5, 1, 'user-1', 30, 1500, 'manual'),
      (6, 1, 'user-2', 35, 1600, 'manual');
    INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, transaction_time)
      VALUES (1, 'user-1', 'initial_allocation', 100, 100, 900);
  `);
}

function request(query = "") {
  // Il file route è importato direttamente dal disco: NextRequest non serve,
  // alla handler basta l'oggetto nextUrl come fanno gli altri test API.
  return { nextUrl: new URL(`https://app.test/api/leagues/1/activity-log${query}`) } as never;
}

function ctx() {
  return { params: Promise.resolve({ "league-id": "1" }) } as never;
}

async function get(query = "") {
  const { GET } = await import("@/app/api/leagues/[league-id]/activity-log/route");
  return GET(request(query), ctx());
}

beforeEach(async () => {
  vi.resetModules();
  currentUser.mockReset();
  await seed();
});

describe("GET /api/leagues/[league-id]/activity-log (A2)", () => {
  it("restituisce 401 senza utente autenticato", async () => {
    currentUser.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
  });

  it("restituisce 403 per un utente esterno alla lega", async () => {
    currentUser.mockResolvedValue({ id: "outsider", publicMetadata: {} });
    const response = await get();
    expect(response.status).toBe(403);
  });

  it("restituisce 200 e gli eventi per un partecipante", async () => {
    currentUser.mockResolvedValue({ id: "user-1", publicMetadata: {} });
    const response = await get();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.totalCount).toBeGreaterThanOrEqual(7); // 6 rilanci + 1 transazione
    const bidEvents = body.events.filter(
      (e: { event_type: string }) => e.event_type === "bid"
    );
    expect(bidEvents.length).toBeGreaterThanOrEqual(6);
    const description = bidEvents[0].description as string;
    // La query sui rilanci (CTE + join su players) produce descrizioni complete.
    expect(description).toMatch(/\d+ crediti per Attaccante \(A\)/);
    // La CTE corretta espone player_id: nessuna descrizione con "undefined".
    expect(description).not.toContain("undefined");
  });

  it("pagina senza duplicati né buchi", async () => {
    currentUser.mockResolvedValue({ id: "user-1", publicMetadata: {} });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
      const response = await get(query);
      expect(response.status).toBe(200);
      const body = await response.json();
      seen.push(...body.events.map((e: { id: string }) => e.id));
      if (!body.hasMore) break;
      expect(body.nextCursor).toBeTruthy();
      cursor = body.nextCursor;
    }

    expect(new Set(seen).size).toBe(seen.length); // nessun duplicato
    expect(seen.length).toBeGreaterThanOrEqual(7); // nessun buco: tutto recuperato
  });
});
