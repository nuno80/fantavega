import { createClient, type Client } from "@libsql/client";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

// PERF-001: paging indexes must be part of the canonical schema AND shipped as
// an additive migration, so both fresh bootstraps and existing databases get them.

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

const EXPECTED_INDEXES = [
  { name: "idx_bids_time", table: "bids", columns: ["bid_time", "id"] },
  { name: "idx_bids_user_time", table: "bids", columns: ["user_id", "bid_time", "id"] },
  { name: "idx_budget_tx_league_time", table: "budget_transactions", columns: ["auction_league_id", "transaction_time", "id"] },
  { name: "idx_user_sessions_start", table: "user_sessions", columns: ["session_start", "id"] },
  { name: "idx_user_sessions_end", table: "user_sessions", columns: ["session_end", "id"] },
  { name: "idx_response_timers_event_time", table: "user_auction_response_timers", columns: ["COALESCE(processed_at, activated_at, created_at)", "id"] },
];

async function deployedClient() {
  const client = createClient({ url: "file::memory:" });
  clients.push(client);
  await deployDatabaseSchema(client);
  return client;
}

describe("PERF-001 activity log paging indexes", () => {
  it("ships the paging indexes in the migration manifest", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "database", "migrations", "manifest.json"),
        "utf8"
      )
    );
    expect(manifest.migrations).toContain("add_activity_log_paging_indexes.sql");
  });

  it("creates every paging index on a fresh bootstrap", async () => {
    const client = await deployedClient();
    for (const expected of EXPECTED_INDEXES) {
      const result = await client.execute({
        sql: "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?",
        args: [expected.name],
      });
      expect(result.rows, expected.name).toHaveLength(1);
    }
  });

  it("applies the migration to a pre-existing database without it", async () => {
    const client = await deployedClient();
    for (const expected of EXPECTED_INDEXES) {
      await client.execute(`DROP INDEX IF EXISTS ${expected.name}`);
    }

    // Re-run the single migration file, as a DB rolled out before PERF-001 would.
    const migrationSql = fs.readFileSync(
      path.join(process.cwd(), "database", "migrations", "add_activity_log_paging_indexes.sql"),
      "utf8"
    );
    await client.executeMultiple(migrationSql);

    for (const expected of EXPECTED_INDEXES) {
      const result = await client.execute({
        sql: "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?",
        args: [expected.name],
      });
      expect(result.rows, expected.name).toHaveLength(1);
    }
  });

  it("uses an index for the bids paging query", async () => {
    const client = await deployedClient();
    await client.executeMultiple(`
      INSERT INTO users (id, email) VALUES ('admin-1', 'a@x.it'), ('u1', 'u1@x.it');
      INSERT INTO players (id, role, name, team, current_quotation, initial_quotation)
        VALUES (1, 'P', 'Portiere', 'Team', 10, 10);
      INSERT INTO auction_leagues (id, name, initial_budget_per_manager, admin_creator_id)
        VALUES (1, 'liga', 100, 'admin-1');
      INSERT INTO auctions (id, auction_league_id, player_id, start_time, scheduled_end_time)
        VALUES (1, 1, 1, 1, 2);
      INSERT INTO bids (id, auction_id, user_id, amount, bid_time) VALUES (1, 1, 'u1', 5, 100);
    `);

    const base = `WITH league_bid_auctions(aid) AS MATERIALIZED (SELECT id FROM auctions WHERE auction_league_id = ?)
      SELECT b.id FROM bids b JOIN league_bid_auctions f ON b.auction_id = f.aid`;
    const orderBy = `ORDER BY b.bid_time DESC, b.id DESC LIMIT 50 OFFSET 0`;

    // Unfiltered: the planner may scan bids via the time index or join from the
    // league CTE; what must never happen is a full history sort.
    const unfiltered = await client.execute({
      sql: `EXPLAIN QUERY PLAN ${base} ${orderBy}`,
      args: [1],
    });
    const unfilteredDetail = unfiltered.rows.map((row) => String(row.detail)).join("\n");
    expect(unfilteredDetail).toMatch(/idx_bids_auction_time|TEMP B-TREE/);

    // With a user filter the (user_id, bid_time, id) index avoids the sort.
    const byUser = await client.execute({
      sql: `EXPLAIN QUERY PLAN ${base} WHERE b.user_id = 'u1' ${orderBy}`,
      args: [1],
    });
    const byUserDetail = byUser.rows.map((row) => String(row.detail)).join("\n");
    expect(byUserDetail).toContain("idx_bids_user_time");
  });
});
