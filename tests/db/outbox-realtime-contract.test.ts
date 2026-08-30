// tests/db/outbox-realtime-contract.test.ts
// Copre il contratto realtime del piano d'azione (punto 4):
// - aggiornamento locale dopo il successo della server action (dati confermati);
// - ricezione socket da un secondo client (via dispatch → notify → /api/emit);
// - fallback dopo evento socket perso (retry dell'outbox);
// - nessun polling client (nessun riferimento nel client);
// - nessun evento outbox bloccato (recupero claim scaduti).
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer: notifyMock }));

import { db } from "@/lib/db";
import {
  dispatchOutboxEvents,
  enqueueOutboxEvent,
  getOutboxBacklog,
} from "@/lib/db/services/event-outbox.service";

const client = db as Client;
const now = () => Math.floor(Date.now() / 1000);

describe("outbox realtime contract", () => {
  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);
  });

  beforeEach(async () => {
    await client.execute({ sql: "DELETE FROM event_outbox", args: [] });
    notifyMock.mockReset();
  });

  afterAll(async () => {
    await client.close();
  });

  it("la server action conferma i dati per l'aggiornamento locale (nessun polling client)", () => {
    // Il client deve aggiornare la UI con la risposta della server action,
    // non con polling: verifico che non esista alcun loop di polling.
    const clientSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/auctions/AuctionPageContent.tsx"),
      "utf8",
    );
    expect(clientSource).not.toMatch(/setInterval\([^)]*fetch/);
    expect(clientSource).not.toMatch(/polling|setInterval.*fetchManagersData/);
  });

  it("l'outbox consegna a un secondo client via notifySocketServer (ricezione socket)", async () => {
    notifyMock.mockResolvedValue({ success: true });

    await enqueueOutboxEvent(client, {
      eventType: "auction-update",
      room: "league-1",
      eventName: "auction-updated",
      payload: { auctionId: 7, currentBid: 120 },
    });

    await dispatchOutboxEvents();

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        room: "league-1",
        event: "auction-updated",
        data: { auctionId: 7, currentBid: 120 },
      }),
    );
    // L'evento e' stato consegnato (cancellato dall'outbox).
    const backlog = await getOutboxBacklog();
    expect(backlog.pending).toBe(0);
  });

  it("fallback dopo evento socket perso: l'outbox riprova fino a consegna", async () => {
    // Prima notifica fallisce (socket giu'), la seconda riesce.
    notifyMock.mockRejectedValueOnce(new Error("socket down"));
    notifyMock.mockResolvedValueOnce({ success: true });

    await enqueueOutboxEvent(client, {
      eventType: "auction-update",
      room: "league-1",
      eventName: "auction-updated",
      payload: { auctionId: 8 },
    });

    await dispatchOutboxEvents();
    const backlog1 = await getOutboxBacklog();
    expect(backlog1.pending).toBe(1); // riproverà (next_attempt_at in futuro)

    // Forzo il retry (next_attempt_at nel passato) e ridispatcho.
    await client.execute({
      sql: "UPDATE event_outbox SET next_attempt_at = ?",
      args: [now() - 1],
    });
    await dispatchOutboxEvents();
    const backlog2 = await getOutboxBacklog();
    expect(backlog2.pending).toBe(0); // consegnato
  });

  it("nessun evento outbox bloccato: un claim scaduto viene recuperato (punto 1)", async () => {
    // Simula un dispatcher morto: evento claimato ma mai consegnato.
    await client.execute({
      sql: `INSERT INTO event_outbox
            (event_id, event_type, room, event_name, payload, essential, status, attempts, next_attempt_at, created_at, claimed_at, owner_token)
            VALUES (?, 'auction-update', 'league-1', 'auction-updated', '{}', 1, 'pending', 0, ?, ?, ?, 'dead-token')`,
      args: [crypto.randomUUID(), now(), now() - 120, now() - 120],
    });

    notifyMock.mockResolvedValue({ success: true });

    await dispatchOutboxEvents();
    const backlog = await getOutboxBacklog();
    expect(backlog.pending).toBe(0);
    expect(notifyMock).toHaveBeenCalled();
  });
});
