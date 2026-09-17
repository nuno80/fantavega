import { type Client, createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

const clients: Client[] = [];

const EXPECTED_INDEXES = [
  "idx_participants_locked_nonzero",
  "idx_auctions_league_status_bidder",
  "idx_bids_auction_user_time",
  "idx_compliance_due",
  "idx_outbox_claimable",
];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function deployedClient(): Promise<Client> {
  const client = createClient({ url: "file::memory:" });
  clients.push(client);
  await deployDatabaseSchema(client);
  return client;
}

describe("PERF-002 Turso read optimization indexes", () => {
  it("ships the additive migration", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "database", "migrations", "manifest.json"),
        "utf8"
      )
    );
    expect(manifest.migrations).toContain(
      "add_turso_read_optimization_indexes.sql"
    );
  });

  it("creates every hot-path index on a fresh database", async () => {
    const client = await deployedClient();
    const result = await client.execute({
      sql: `SELECT name FROM sqlite_schema
            WHERE type = 'index' AND name IN (${EXPECTED_INDEXES.map(() => "?").join(", ")})`,
      args: EXPECTED_INDEXES,
    });
    expect(new Set(result.rows.map((row) => String(row.name)))).toEqual(
      new Set(EXPECTED_INDEXES)
    );
  });

  it("applies every hot-path index to an existing database", async () => {
    const client = await deployedClient();
    for (const index of EXPECTED_INDEXES) {
      await client.execute(`DROP INDEX IF EXISTS ${index}`);
    }

    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "database",
        "migrations",
        "add_turso_read_optimization_indexes.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(migration);

    const result = await client.execute({
      sql: `SELECT name FROM sqlite_schema
            WHERE type = 'index' AND name IN (${EXPECTED_INDEXES.map(() => "?").join(", ")})`,
      args: EXPECTED_INDEXES,
    });
    expect(new Set(result.rows.map((row) => String(row.name)))).toEqual(
      new Set(EXPECTED_INDEXES)
    );
  });
});
