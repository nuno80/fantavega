// tests/db/league-actions-admin-role.test.ts
// Regressione re-audit 2026-08-09 (PR C): le tre action del file
// league.actions.ts (updateTeamNameAction, updateLeagueStatusAction,
// updateActiveRolesAction) devono rifiutare un chiamante autenticato
// SENZA ruolo admin, senza scrivere nulla nel DB.
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Utente autenticato ma NON admin (sessionClaims senza ruolo admin).
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({
    userId: "non-admin-user",
    sessionClaims: { metadata: { role: "manager" } },
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

// Spy sul db reale in-memory per verificare che nessuna scrittura avvenga.
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));

import { db } from "@/lib/db";
import {
  updateActiveRolesAction,
  updateLeagueStatusAction,
  updateTeamNameAction,
} from "@/lib/actions/league.actions";

const client = db as Client;

const buildFormData = (values: Record<string, string | string[]>): FormData => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
};

describe("league admin server actions reject non-admin callers", () => {
  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);

    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('non-admin-user', 'nonadmin@test.dev', 'nonadmin', 'manager', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('participant-user', 'part@test.dev', 'part', 'manager', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('admin-owner', 'owner@test.dev', 'owner', 'admin', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auction_leagues (id, name, status, initial_budget_per_manager, admin_creator_id)
            VALUES (31, 'Lega Admin Test', 'draft_active', 500, 'admin-owner')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO league_participants (league_id, user_id, manager_team_name, current_budget, locked_credits)
            VALUES (31, 'participant-user', 'Team Partecipante', 500, 0)`,
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
    await client.execute("DELETE FROM league_participants WHERE league_id != 31");
    await client.execute({
      sql: `UPDATE auction_leagues SET status = 'draft_active', active_auction_roles = '' WHERE id = 31`,
      args: [],
    });
    await client.execute({
      sql: `UPDATE league_participants SET manager_team_name = 'Team Partecipante' WHERE league_id = 31 AND user_id = 'participant-user'`,
      args: [],
    });
  });

  it("updateTeamNameAction rifiuta il non-admin e non scrive", async () => {
    const result = await updateTeamNameAction(
      { success: false, message: "" },
      buildFormData({
        leagueId: "31",
        participantUserId: "participant-user",
        newTeamName: "Nome Hacker",
      })
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/admin/i);
    const row = await client.execute(
      "SELECT manager_team_name FROM league_participants WHERE league_id = 31 AND user_id = 'participant-user'"
    );
    expect(row.rows[0].manager_team_name).toBe("Team Partecipante");
  });

  it("updateLeagueStatusAction rifiuta il non-admin e non scrive", async () => {
    const result = await updateLeagueStatusAction(
      { success: false, message: "" },
      buildFormData({ leagueId: "31", newStatus: "market_closed" })
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/admin/i);
    const row = await client.execute(
      "SELECT status FROM auction_leagues WHERE id = 31"
    );
    expect(row.rows[0].status).toBe("draft_active");
  });

  it("updateActiveRolesAction rifiuta il non-admin e non scrive", async () => {
    const result = await updateActiveRolesAction(
      { success: false, message: "" },
      buildFormData({ leagueId: "31", active_roles: ["P", "D"] })
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/admin/i);
    const row = await client.execute(
      "SELECT active_auction_roles FROM auction_leagues WHERE id = 31"
    );
    expect(row.rows[0].active_auction_roles).toBe("");
  });
});
