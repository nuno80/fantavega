// tests/db/cooldown-preserves-preferences.test.ts
// Regressione re-audit 2026-08-09 (PR B): il cooldown applicato via
// handleAuctionAbandon NON deve resettare i toggle personali
// (is_favorite, is_starter, integrity_value, has_fmv) sulla riga
// user_player_preferences. Prima del fix, INSERT OR REPLACE eliminava
// la riga e reinseriva solo le colonne del cooldown, riportando i
// toggle ai default.
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock del db con client reale in-memory (stesso pattern degli altri test).
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));
// Il service notifica via socket fire-and-forget: mock innocuo.
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { handleAuctionAbandon } from "@/lib/db/services/auction-states.service";

const client = db as Client;

describe("cooldown preserves personal preferences", () => {
  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);

    // Dati minimi per handleAuctionAbandon: asta attiva, timer pendente,
    // preferenza esistente con toggle personali.
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('user-cooldown', 'cd@test.dev', 'cd', 'manager', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auction_leagues (id, name, status, initial_budget_per_manager, admin_creator_id)
            VALUES (21, 'Lega Cooldown', 'market_closed', 500, 'user-cooldown')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('other-user', 'other@test.dev', 'other', 'manager', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO players (id, name, role, team, current_quotation, initial_quotation) VALUES (211, 'Giocatore CD', 'P', 'Squadra CD', 1, 1)`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auctions (id, auction_league_id, player_id, current_highest_bidder_id, current_highest_bid_amount, scheduled_end_time, start_time, status)
            VALUES (2111, 21, 211, 'other-user', 100, ?, ?, 'active')`,
      args: [Math.floor(Date.now() / 1000) + 3600, Math.floor(Date.now() / 1000)],
    });
    await client.execute({
      sql: `INSERT INTO user_auction_response_timers (id, auction_id, user_id, created_at, response_deadline, status)
            VALUES (21111, 2111, 'user-cooldown', ?, NULL, 'pending')`,
      args: [Math.floor(Date.now() / 1000)],
    });
    // Preferenza con toggle personali già salvati.
    await client.execute({
      sql: `INSERT INTO user_player_preferences (user_id, player_id, league_id, is_starter, is_favorite, integrity_value, has_fmv, created_at, updated_at)
            VALUES ('user-cooldown', 211, 21, 1, 1, 5, 1, 1000, 1000)`,
      args: [],
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it("preserva is_favorite/is_starter/integrity/has_fmv e aggiorna expires_at", async () => {
    await handleAuctionAbandon(2111, "user-cooldown");

    const row = await client.execute({
      sql: `SELECT is_starter, is_favorite, integrity_value, has_fmv, preference_type, expires_at
            FROM user_player_preferences
            WHERE user_id = 'user-cooldown' AND player_id = 211 AND league_id = 21`,
      args: [],
    });
    const pref = row.rows[0];
    expect(pref).toBeDefined();
    expect(pref.is_starter).toBe(1);
    expect(pref.is_favorite).toBe(1);
    expect(pref.integrity_value).toBe(5);
    expect(pref.has_fmv).toBe(1);
    expect(pref.preference_type).toBe("cooldown");
    expect(Number(pref.expires_at)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
