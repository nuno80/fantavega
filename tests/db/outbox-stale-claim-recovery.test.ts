// tests/db/outbox-stale-claim-recovery.test.ts
// Verifica il recupero dei claim scaduti (punto 1 del piano d'azione):
// un evento claimato da un dispatcher morto deve poter essere reclamato
// dopo la soglia di scadenza, senza doppia consegna durante un'elaborazione
// valida.
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock del db con client reale in-memory (stesso pattern degli altri test db).
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { dispatchOutboxEvents } from "@/lib/db/services/event-outbox.service";

const client = db as Client;
const now = () => Math.floor(Date.now() / 1000);

const insertRawEvent = async (overrides: Record<string, unknown> = {}) => {
  const base = {
    event_id: crypto.randomUUID(),
    event_type: "auction-update",
    room: "league:1",
    event_name: "auction-updated",
    payload: JSON.stringify({ id: 1 }),
    essential: 1,
    status: "pending",
    attempts: 0,
    next_attempt_at: now(),
    created_at: now(),
    claimed_at: null as number | null,
    owner_token: null as string | null,
  };
  const row = { ...base, ...overrides };
  await client.execute({
    sql: `INSERT INTO event_outbox
          (event_id, event_type, room, event_name, payload, essential, status, attempts, next_attempt_at, created_at, claimed_at, owner_token)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      row.event_id, row.event_type, row.room, row.event_name, row.payload,
      row.essential, row.status, row.attempts, row.next_attempt_at,
      row.created_at, row.claimed_at, row.owner_token,
    ],
  });
  return row;
};

describe("outbox stale claim recovery", () => {
  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);
  });

  beforeEach(async () => {
    await client.execute({ sql: "DELETE FROM event_outbox", args: [] });
    vi.mocked(
      (await import("@/lib/socket-emitter")).notifySocketServer,
    ).mockClear();
  });

  afterAll(async () => {
    await client.close();
  });

  it("reclama un evento con claim scaduto (claimed_at < now - 60)", async () => {
    const stale = await insertRawEvent({ claimed_at: now() - 120, owner_token: "dead-token" });
    const delivered = await dispatchOutboxEvents();
    expect(delivered).toBe(1);
    // L'evento è stato consegnato e cancellato.
    const row = await client.execute({
      sql: "SELECT id FROM event_outbox WHERE event_id = ?",
      args: [stale.event_id],
    });
    expect(row.rows).toHaveLength(0);
  });

  it("NON reclama un claim ancora valido (< 60s)", async () => {
    const fresh = await insertRawEvent({ claimed_at: now() - 10, owner_token: "live-token" });
    const delivered = await dispatchOutboxEvents();
    expect(delivered).toBe(0);
    const row = await client.execute({
      sql: "SELECT owner_token FROM event_outbox WHERE event_id = ?",
      args: [fresh.event_id],
    });
    // Ancora claimato dal dispatcher originale, token invariato.
    expect(row.rows[0].owner_token).toBe("live-token");
  });

  it("recupera un solo claim scaduto alla volta quando ne esistono di freschi", async () => {
    await insertRawEvent({ claimed_at: now() - 120, owner_token: "dead-1" });
    await insertRawEvent({ claimed_at: now() - 120, owner_token: "dead-2" });
    await insertRawEvent({ claimed_at: now() - 5, owner_token: "live-1" });

    const delivered = await dispatchOutboxEvents();
    // Solo uno dei due scaduti (batch size 1), il fresco resta.
    expect(delivered).toBe(1);

    const rows = await client.execute({
      sql: `SELECT owner_token FROM event_outbox
            WHERE claimed_at IS NOT NULL ORDER BY id`,
      args: [],
    });
    const tokens = rows.rows.map((r) => r.owner_token);
    expect(tokens).toContain("live-1");
    expect(tokens.filter((t) => t === "dead-1" || t === "dead-2").length).toBe(1);
  });

  it("nessuna doppia consegna durante elaborazione valida (due dispatcher)", async () => {
    const notifyMock = vi.mocked(
      (await import("@/lib/socket-emitter")).notifySocketServer,
    );
    notifyMock.mockClear();

    // Primo dispatcher: claima e consegna.
    const e = await insertRawEvent({});
    await dispatchOutboxEvents();
    expect(notifyMock).toHaveBeenCalledTimes(1);

    // Secondo dispatcher immediato: non deve rivedere l'evento (cancellato).
    const again = await dispatchOutboxEvents();
    expect(again).toBe(0);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(e.event_id).toBeTruthy();
  });
});
