// tests/db/league-status-action.test.ts
// Regressione per il bug "il cambio stato lega non funziona".
// Verifica che updateLeagueStatusAction aggiorni davvero lo stato nel DB
// quando il FormData contiene newStatus (il bug era che il Select Radix
// non serializzava il valore → newStatus mancante → nessun UPDATE).
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dell'autenticazione Clerk: utente autenticato con ruolo admin
// nei sessionClaims (checkIsAdmin li legge; senza, il fallback Clerk API
// non è disponibile in test).
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({
    userId: "admin-test",
    sessionClaims: { metadata: { role: "admin" } },
  }),
}));
// revalidatePath non esiste fuori dal runtime Next: mock innocuo.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
// Il servizio importa socket-emitter fire-and-forget: mock innocuo.
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

// Mock di @/lib/db con un client reale in-memory (stesso pattern degli altri test).
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));

import { updateLeagueStatusAction } from "@/lib/actions/league.actions";

const client: Client = (await import("@/lib/db")).db as Client;

const buildFormData = (leagueId: number, newStatus: string): FormData => {
  const fd = new FormData();
  fd.set("leagueId", String(leagueId));
  fd.set("newStatus", newStatus);
  return fd;
};

describe("updateLeagueStatusAction (libSQL :memory:)", () => {
  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('admin-test', 'admin@test.dev', 'admin-test', 'admin', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auction_leagues (id, name, status, initial_budget_per_manager, admin_creator_id)
            VALUES (16, 'Lega Test', 'draft_active', 500, 'admin-test')`,
      args: [],
    });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.execute("DELETE FROM player_assignments");
    await client.execute("DELETE FROM auctions");
    await client.execute("DELETE FROM players");
    await client.execute("DELETE FROM auction_leagues WHERE id != 16");
    await client.execute(
      "UPDATE auction_leagues SET status = 'draft_active' WHERE id = 16"
    );
  });

  it("cambia lo stato della lega quando newStatus è presente nel FormData", async () => {
    const result = await updateLeagueStatusAction(
      { success: false, message: "" },
      buildFormData(16, "market_closed")
    );

    expect(result.success).toBe(true);
    const row = await client.execute(
      "SELECT status FROM auction_leagues WHERE id = 16"
    );
    expect(row.rows[0].status).toBe("market_closed");
  });

  it("non cambia nulla quando newStatus manca (il bug del Select Radix)", async () => {
    // Simula il comportamento del vecchio form: il Select non serializzava
    // il valore, quindi newStatus non arriva mai nel FormData.
    const fd = new FormData();
    fd.set("leagueId", "16");
    const result = await updateLeagueStatusAction(
      { success: false, message: "" },
      fd
    );

    expect(result.success).toBe(false);
    const row = await client.execute(
      "SELECT status FROM auction_leagues WHERE id = 16"
    );
    expect(row.rows[0].status).toBe("draft_active");
  });

  it("restituisce errore per una lega inesistente", async () => {
    const result = await updateLeagueStatusAction(
      { success: false, message: "" },
      buildFormData(9999, "completed")
    );
    expect(result.success).toBe(false);
  });
});
