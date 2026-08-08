// tests/db/league-status-list-refresh.test.ts
// Regressione per il bug "il cambio stato non si riflette nella pagina
// /admin/leagues". Verifica il percorso COMPLETO azione → DB → query lista:
// se l'azione aggiorna lo stato, getLeaguesForAdminList (usata dalla pagina
// lista) deve restituire il valore nuovo.
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock solo dell'autenticazione Clerk; il DB è reale (in-memory).
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "admin-test" }),
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
import { getLeaguesForAdminList } from "@/lib/db/services/auction-league.service";

const client: Client = (await import("@/lib/db")).db as Client;

describe("percorso completo: azione → DB → lista admin", () => {
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
            VALUES (11, 'Lega Riparazione', 'draft_active', 500, 'admin-test')`,
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

  it("dopo updateLeagueStatusAction, getLeaguesForAdminList restituisce lo stato nuovo", async () => {
    // 1. Stato iniziale: lista legge 'draft_active' per entrambe
    let leagues = await getLeaguesForAdminList();
    const lega11 = leagues.find((l) => l.id === 11);
    expect(lega11?.status).toBe("draft_active");

    // 2. Azione: cambia stato della lega 11 in repair_active
    const fd = new FormData();
    fd.set("leagueId", "11");
    fd.set("newStatus", "repair_active");
    const result = await updateLeagueStatusAction(
      { success: false, message: "" },
      fd
    );
    expect(result.success).toBe(true);

    // 3. Nuova query della lista (come farebbe un refresh della pagina):
    //    deve vedere 'repair_active'.
    leagues = await getLeaguesForAdminList();
    const lega11Dopo = leagues.find((l) => l.id === 11);
    expect(lega11Dopo?.status).toBe("repair_active");
  });
});
