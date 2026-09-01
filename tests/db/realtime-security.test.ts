// tests/db/realtime-security.test.ts
// B2/B3/B6: sicurezza realtime dell'asta.
// - B2: il payload pubblico di auction-update NON contiene dati finanziari
//   personali; i crediti (budget, locked, massimale auto-bid) viaggiano solo
//   sugli eventi privati user-auction-private-update verso user-${userId}.
// - B3: il flusso abandon pubblica eventi nell'outbox PRIMA del commit
//   (nessun notifySocketServer post-commit, nessun budgetUpdates pubblico).
// - B6: gli eventi privati finiscono nell'outbox (essential=1) e vengono
//   consegnati via dispatcher dopo il commit; il client non esce mai dalla
//   stanza personale al cambio lega (la join è globale in SocketContext).
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

// Mock del db con client reale su file temporaneo: il servizio usa sia
// execute che transaction. Un file:memory: semplice non funziona perché
// client.transaction() apre una connessione con un database vuoto separato
// (invisibile); un file temporaneo reale condivide lo storage tra connessioni.
let client: Client;
let dbPath: string;
vi.mock("@/lib/db", () => ({
  db: {
    execute: (input: Parameters<Client["execute"]>[0]) => client.execute(input),
    transaction: () => client.transaction("write"),
  },
}));
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer: notifyMock }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));

import { placeBidOnExistingAuction } from "@/lib/db/services/bid.service";
import { dispatchOutboxEvents } from "@/lib/db/services/event-outbox.service";
import { abandonAuction } from "@/lib/db/services/response-timer.service";

afterEach(async () => {
  if (client) await client.close();
  if (dbPath) {
    for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
  notifyMock.mockReset();
});

async function seededClient() {
  notifyMock.mockResolvedValue({ success: true });
  dbPath = path.join(os.tmpdir(), `realtime-security-${randomUUID()}.db`);
  client = createClient({ url: `file:${dbPath}` });
  await deployDatabaseSchema(client);
  // Lega, utenti e partecipanti con budget pieni.
  await client.executeMultiple(`
    INSERT INTO users (id, email, username, full_name, role) VALUES
      ('alice', 'alice@x.it', 'alice', 'Alice', 'manager'),
      ('bruno', 'bruno@x.it', 'bruno', 'Bruno', 'manager'),
      ('cesare', 'cesare@x.it', 'cesare', 'Cesare', 'manager');
    INSERT INTO auction_leagues (id, name, initial_budget_per_manager, admin_creator_id, timer_duration_minutes, status)
      VALUES (1, 'Lega', 500, 'alice', 2, 'draft_active');
    INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits, manager_team_name) VALUES
      (1, 'alice', 500, 0, 'Squadra Alice'),
      (1, 'bruno', 500, 0, 'Squadra Bruno'),
      (1, 'cesare', 500, 0, 'Squadra Cesare');
    INSERT INTO players (id, role, name, team, current_quotation, initial_quotation) VALUES
      (1, 'A', 'Messi', 'MIA', 20, 20);
  `);
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

describe("B2/B6 sicurezza realtime dei flussi bid", () => {
  it("l'evento pubblico non espone dati finanziari; i privati vanno solo ai coinvolti", async () => {
    const c = await seededClient();
    const now = Math.floor(Date.now() / 1000);
    // Asta attiva: alice è massimo offerente a 20 (auto-bid già attivato),
    // bruno è stato superato ed ha un timer di risposta pendente.
    await c.executeMultiple(`
      INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
        VALUES (1, 1, 1, ${now - 10}, ${now + 60}, 20, 'alice', 'active');
      INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active)
        VALUES (1, 'alice', 50, 1);
      INSERT INTO user_auction_response_timers (auction_id, user_id, status, response_deadline)
        VALUES (1, 'bruno', 'pending', ${now + 60});
    `);

    // bruno rilancia a 30 → l'auto-bid di alice (max 50) scatta e vince a 31.
    await placeBidOnExistingAuction({
      leagueId: 1,
      userId: "bruno",
      playerId: 1,
      bidAmount: 30,
    });

    const result = await c.execute({
      sql: "SELECT event_type, room, event_name, payload, essential, status FROM event_outbox ORDER BY room",
      args: [],
    });

    // --- evento pubblico: solo stato asta ---
    const publicRow = result.rows.find((r) => r.event_type === "auction-update");
    expect(publicRow).toBeDefined();
    expect(publicRow!.room).toBe("league-1");
    expect(Number(publicRow!.essential)).toBe(1);
    const publicPayload = JSON.parse(String(publicRow!.payload)) as Record<string, unknown>;
    expect(publicPayload.playerId).toBe(1);
    expect(publicPayload.newPrice).toBe(31);
    expect(publicPayload.highestBidderId).toBe("alice");
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      expect(publicPayload).not.toHaveProperty(key);
    }
    expect(publicPayload.newBid).toBeDefined();
    expect(publicPayload.scheduledEndTime).toBeGreaterThan(now);

    // --- eventi privati: solo alice (vincitrice) e bruno (superato) ---
    const privateRows = result.rows.filter((r) => r.event_type === "user-auction-private-update");
    expect(privateRows).toHaveLength(2);
    const rooms = privateRows.map((r) => r.room).sort();
    expect(rooms).toEqual(["user-alice", "user-bruno"]);
    // nessun evento per cesare (non coinvolto)
    expect(rooms).not.toContain("user-cesare");
    for (const row of privateRows) {
      expect(Number(row.essential)).toBe(1);
      expect(row.status).toBe("pending");
      const payload = JSON.parse(String(row.payload)) as Record<string, unknown>;
      expect(payload.playerId).toBe(1);
      expect(payload.leagueId).toBe(1);
      expect(payload).toHaveProperty("currentBudget");
      expect(payload).toHaveProperty("lockedCredits");
    }

    const alicePayload = JSON.parse(
      String(privateRows.find((r) => r.room === "user-alice")!.payload),
    ) as Record<string, unknown>;
    expect(alicePayload).toMatchObject({
      currentBudget: 500,
      lockedCredits: 50, // auto-bid attivo max 50
      autoBid: { maxAmount: 50, isActive: true },
    });

    const brunoPayload = JSON.parse(
      String(privateRows.find((r) => r.room === "user-bruno")!.payload),
    ) as Record<string, unknown>;
    expect(brunoPayload).toMatchObject({ currentBudget: 500, lockedCredits: 0 });
    // il massimale di alice NON deve mai comparire nel payload di bruno:
    // l'unico campo finanziario è il suo, e non c'è autoBid.
    expect(brunoPayload).not.toHaveProperty("autoBid");
    expect(brunoPayload.lockedCredits).not.toBe(50);

    // --- i locked credit nel DB riflettono la battaglia ---
    const parts = await c.execute({
      sql: "SELECT user_id, current_budget, locked_credits FROM league_participants WHERE league_id = 1 ORDER BY user_id",
      args: [],
    });
    const lockedByUser = Object.fromEntries(
      (parts.rows as unknown as Array<{ user_id: string; locked_credits: number }>).map((r) => [r.user_id, r.locked_credits]),
    );
    expect(lockedByUser.alice).toBe(50);
    expect(lockedByUser.bruno).toBe(0);
  });

  it("gli eventi privati dell'outbox vengono consegnati via dispatcher nelle stanze giuste", async () => {
    const c = await seededClient();
    const now = Math.floor(Date.now() / 1000);
    // Asta attiva: alice è massimo offerente a 20; bruno superato con timer pendente.
    await c.executeMultiple(`
      INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
        VALUES (1, 1, 1, ${now - 10}, ${now + 60}, 20, 'alice', 'active');
      INSERT INTO auto_bids (auction_id, user_id, max_amount, is_active)
        VALUES (1, 'alice', 50, 1);
      INSERT INTO user_auction_response_timers (auction_id, user_id, status, response_deadline)
        VALUES (1, 'bruno', 'pending', ${now + 60});
    `);

    await placeBidOnExistingAuction({
      leagueId: 1,
      userId: "bruno",
      playerId: 1,
      bidAmount: 30,
    });

    notifyMock.mockResolvedValue({ success: true });
    await dispatchOutboxEvents();

    const deliveredRooms = notifyMock.mock.calls.map((call) => call[0].room as string).sort();
    // pubblico a league-1 + privati a user-alice e user-bruno
    expect(deliveredRooms).toContain("league-1");
    expect(deliveredRooms).toContain("user-alice");
    expect(deliveredRooms).toContain("user-bruno");
    expect(deliveredRooms).not.toContain("user-cesare");

    const privateCalls = notifyMock.mock.calls.filter((call) => call[0].event === "user-auction-private-update");
    expect(privateCalls.length).toBe(2);
    for (const call of privateCalls) {
      expect(call[0].data).toHaveProperty("currentBudget");
      expect(call[0].data).toHaveProperty("lockedCredits");
    }

    // consegnato = cancellato dall'outbox
    const backlog = await c.execute({ sql: "SELECT COUNT(*) as n FROM event_outbox", args: [] });
    expect(Number((backlog.rows[0] as unknown as { n: number }).n)).toBe(0);
  });
});

describe("B3 abandon: eventi nell'outbox prima del commit, mai budgetUpdates pubblici", () => {
  it("abbandonare pubblica solo stato asta in pubblico e i propri crediti in privato", async () => {
    const c = await seededClient();
    const now = Math.floor(Date.now() / 1000);
    // Asta attiva con alice massimo offerente; bruno ha un timer di risposta pendente.
    await c.executeMultiple(`
      INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
        VALUES (1, 1, 1, ${now - 10}, ${now + 60}, 20, 'alice', 'active');
      INSERT INTO user_auction_response_timers (auction_id, user_id, status, response_deadline)
        VALUES (1, 'bruno', 'pending', ${now + 60});
    `);

    await abandonAuction("bruno", 1, 1);

    const result = await c.execute({
      sql: "SELECT event_type, room, event_name, payload, essential FROM event_outbox ORDER BY room",
      args: [],
    });

    const publicRow = result.rows.find((r) => r.event_type === "auction-update");
    expect(publicRow!.room).toBe("league-1");
    const publicPayload = JSON.parse(String(publicRow!.payload)) as Record<string, unknown>;
    expect(publicPayload.action).toBe("abandoned");
    expect(publicPayload.playerId).toBe(1);
    expect(publicPayload.newPrice).toBe(20);
    expect(publicPayload.highestBidderId).toBe("alice");
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      expect(publicPayload).not.toHaveProperty(key);
    }

    const privateRow = result.rows.find((r) => r.event_type === "user-auction-private-update");
    expect(privateRow).toBeDefined();
    expect(privateRow!.room).toBe("user-bruno");
    const privatePayload = JSON.parse(String(privateRow!.payload)) as Record<string, unknown>;
    expect(privatePayload).toMatchObject({ leagueId: 1, playerId: 1, currentBudget: 500, lockedCredits: 0 });

    // solo i 2 eventi, nessun budgetUpdates da nessuna parte
    expect(result.rows).toHaveLength(2);

    // stato DB: timer abbandonato, locked di bruno azzerati
    const timer = await c.execute({
      sql: "SELECT status FROM user_auction_response_timers WHERE auction_id = 1 AND user_id = 'bruno'",
      args: [],
    });
    expect(timer.rows[0]?.status).toBe("abandoned");
    const bruno = await c.execute({
      sql: "SELECT locked_credits FROM league_participants WHERE league_id = 1 AND user_id = 'bruno'",
      args: [],
    });
    expect(Number(bruno.rows[0]?.locked_credits)).toBe(0);
  });
});

describe("B6 client: la stanza personale non viene mai abbandonata al cambio lega", () => {
  it("AuctionPageContent non emette leave-user-room e ascolta l'evento privato", () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      require("path").resolve(process.cwd(), "src/app/auctions/AuctionPageContent.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/leave-user-room/);
    expect(source).toMatch(/user-auction-private-update/);
  });

  it("sincronizza la UI quando lo scheduler conferma la scadenza del timer", () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      require("path").resolve(process.cwd(), "src/app/auctions/AuctionPageContent.tsx"),
      "utf8",
    );

    expect(source).toMatch(
      /socket\.on\("timer-expired-notification", handleResponseTimerExpired\)/,
    );
    expect(source).toMatch(
      /socket\.off\("timer-expired-notification", handleResponseTimerExpired\)/,
    );
  });
});
