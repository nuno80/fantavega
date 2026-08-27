import { createClient, type Client } from "@libsql/client";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { deployDatabaseSchema } from "@/lib/db/utils";

const schemaPath = path.join(process.cwd(), "database", "schema.sql");
const migrationsDir = path.join(process.cwd(), "database", "migrations");

const clients: Client[] = [];
const temporaryDirectories: string[] = [];
const supportedLegacyFixture = fs.readFileSync(
  path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "database",
    "legacy-pre-migrations.sql"
  ),
  "utf8"
);


function temporaryDatabase(): Client {
  const client = createClient({ url: "file::memory:" });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { force: true, recursive: true });
  });
});

function temporaryMigrationsCopy(): string {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "fantavega-migrations-")
  );
  temporaryDirectories.push(temporaryRoot);
  const copy = path.join(temporaryRoot, "migrations");
  fs.cpSync(migrationsDir, copy, { recursive: true });
  return copy;
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizedSql(sql: unknown): string {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase();
}

function parenthesizedExpressions(sql: string, pattern: RegExp): string[] {
  const expressions: string[] = [];
  for (const match of sql.matchAll(pattern)) {
    const open = match.index + match[0].lastIndexOf("(");
    let depth = 0;
    let quote: string | null = null;
    for (let index = open; index < sql.length; index += 1) {
      const character = sql[index];
      if (quote) {
        if (character === quote && sql[index + 1] === quote) {
          index += 1;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          expressions.push(sql.slice(open + 1, index).trim());
          break;
        }
      }
    }
  }
  return expressions.sort();
}

function tableConstraintSignatures(sql: unknown) {
  const normalized = normalizedSql(sql);
  return {
    checks: parenthesizedExpressions(normalized, /\bcheck\s*\(/g),
    generated: parenthesizedExpressions(
      normalized,
      /\bgenerated\s+always\s+as\s*\(/g
    ),
  };
}

async function databaseStructure(client: Client) {
  const objects = await client.execute(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      AND name <> 'schema_migrations'
      AND type IN ('table', 'index', 'trigger')
    ORDER BY type, name
  `);
  const tables = objects.rows
    .filter((row) => row.type === "table")
    .map((row) => String(row.name));

  return {
    tables: await Promise.all(
      tables.map(async (tableName) => {
        const quotedTable = quoteSqlIdentifier(tableName);
        const columns = await client.execute(`PRAGMA table_xinfo(${quotedTable})`);
        const foreignKeys = await client.execute(
          `PRAGMA foreign_key_list(${quotedTable})`
        );
        const indexList = await client.execute(
          `PRAGMA index_list(${quotedTable})`
        );
        const uniqueConstraints = await Promise.all(
          indexList.rows
            .filter((index) => index.origin === "u")
            .map(async (index) => {
              const indexInfo = await client.execute(
                `PRAGMA index_info(${quoteSqlIdentifier(String(index.name))})`
              );
              return indexInfo.rows.map((column) => column.name);
            })
        );
        const tableSql = objects.rows.find(
          (row) => row.type === "table" && row.name === tableName
        )?.sql;
        return {
          ...tableConstraintSignatures(tableSql),
          columns: columns.rows
            .map((row) => ({
              defaultValue: row.dflt_value,
              hidden: Number(row.hidden),
              name: String(row.name),
              notNull: Number(row.notnull),
              primaryKey: Number(row.pk),
              type: String(row.type).toUpperCase(),
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
          foreignKeys: foreignKeys.rows
            .map((row) => ({
              from: row.from,
              onDelete: row.on_delete,
              onUpdate: row.on_update,
              table: row.table,
              to: row.to,
            }))
            .sort((left, right) =>
              JSON.stringify(left).localeCompare(JSON.stringify(right))
            ),
          name: tableName,
          uniqueConstraints: uniqueConstraints.sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right))
          ),
        };
      })
    ),
    indexes: await Promise.all(
      objects.rows
        .filter((row) => row.type === "index" && row.sql !== null)
        .map(async (row) => {
          const columns = await client.execute(
            `PRAGMA index_info(${String(row.name)})`
          );
          const indexList = await client.execute(
            `PRAGMA index_list(${String(row.tbl_name)})`
          );
          const metadata = indexList.rows.find(
            (index) => index.name === row.name
          );
          return {
            columns: columns.rows.map((column) => column.name),
            sql: String(row.sql).replace(/\s+/g, " ").trim().toLowerCase(),
            name: row.name,
            partial: Number(metadata?.partial),
            table: row.tbl_name,
            unique: Number(metadata?.unique),
          };
        })
    ),
    triggers: objects.rows
      .filter((row) => row.type === "trigger")
      .map((row) => ({
        name: row.name,
        sql: String(row.sql).replace(/\s+/g, " ").trim().toLowerCase(),
        table: row.tbl_name,
      })),
  };
}

describe("database deployment migration path", () => {
  it("bootstraps an empty database from the current baseline without replaying historical migrations", async () => {
    const client = temporaryDatabase();

    const result = await deployDatabaseSchema(client, {
      schemaPath,
      migrationsDir,
    });

    expect(result.mode).toBe("baseline");
    const playerColumns = await client.execute("PRAGMA table_info(players)");
    expect(playerColumns.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "is_starter",
        "is_favorite",
        "integrity_value",
        "has_fmv",
      ])
    );
    const tracking = await client.execute(
      "SELECT file_name, source, baseline, checksum FROM schema_migrations ORDER BY sequence"
    );
    expect(tracking.rows.length).toBeGreaterThan(0);
    expect(tracking.rows.every((row) => row.source === "baseline")).toBe(true);
    expect(tracking.rows.every((row) => row.baseline === "2026-08-24")).toBe(
      true
    );
    expect(tracking.rows.every((row) => String(row.checksum).length === 64)).toBe(
      true
    );
    const timerColumns = await client.execute(
      "PRAGMA table_info(user_auction_response_timers)"
    );
    expect(timerColumns.rows.map((row) => row.name)).toContain("last_reset_at");
    const baselineObjects = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE name IN (
        'scheduler_leases',
        'idx_auctions_league_player_active',
        'idx_user_sessions_heartbeat',
        'idx_response_timers_status_deadline'
      )
    `);
    expect(new Set(baselineObjects.rows.map((row) => row.name))).toEqual(
      new Set([
        "scheduler_leases",
        "idx_auctions_league_player_active",
        "idx_user_sessions_heartbeat",
        "idx_response_timers_status_deadline",
      ])
    );
  });

  it("recovers a fresh bootstrap interrupted after schema apply and before baseline tracking", async () => {
    const client = temporaryDatabase();
    let interruptBeforeTracking = true;
    const faultingClient = new Proxy(client, {
      get(target, property) {
        if (property === "execute") {
          return async (statement: string | { sql: string }) => {
            const sql = typeof statement === "string" ? statement : statement.sql;
            if (
              interruptBeforeTracking &&
              /CREATE TABLE IF NOT EXISTS schema_migrations/i.test(sql)
            ) {
              interruptBeforeTracking = false;
              throw new Error("simulated crash before baseline tracking");
            }
            return target.execute(statement);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Client;

    await expect(
      deployDatabaseSchema(faultingClient, { schemaPath, migrationsDir })
    ).rejects.toThrow("simulated crash before baseline tracking");
    const interruptedState = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name IN ('users', 'schema_migrations')
      ORDER BY name
    `);
    expect(interruptedState.rows).toEqual([{ name: "users" }]);

    const retry = await deployDatabaseSchema(client, {
      schemaPath,
      migrationsDir,
    });

    expect(retry).toMatchObject({ applied: [], mode: "baseline" });
    const tracking = await client.execute(`
      SELECT source, baseline, COUNT(*) AS count
      FROM schema_migrations
      GROUP BY source, baseline
    `);
    expect(tracking.rows).toEqual([
      { baseline: "2026-08-24", count: 13, source: "baseline" },
    ]);
  });

  it("recovers a fresh bootstrap interrupted halfway through schema execution", async () => {
    const client = temporaryDatabase();
    let interruptSchema = true;
    const faultingClient = new Proxy(client, {
      get(target, property) {
        if (property === "executeMultiple") {
          return async (sql: string) => {
            if (
              interruptSchema &&
              sql.includes("CREATE TABLE IF NOT EXISTS users")
            ) {
              interruptSchema = false;
              const marker = "CREATE TABLE IF NOT EXISTS auctions";
              const markerPosition = sql.indexOf(marker);
              expect(markerPosition).toBeGreaterThan(0);
              await target.executeMultiple(sql.slice(0, markerPosition));
              throw new Error("simulated crash halfway through schema");
            }
            return target.executeMultiple(sql);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Client;

    await expect(
      deployDatabaseSchema(faultingClient, { schemaPath, migrationsDir })
    ).rejects.toThrow("simulated crash halfway through schema");
    const interruptedState = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name IN ('users', 'players', 'auctions')
      ORDER BY name
    `);
    expect(interruptedState.rows).toEqual([
      { name: "players" },
      { name: "users" },
    ]);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).resolves.toMatchObject({ applied: [], mode: "baseline" });
    const freshClient = temporaryDatabase();
    await deployDatabaseSchema(freshClient, { schemaPath, migrationsDir });
    expect(await databaseStructure(client)).toEqual(
      await databaseStructure(freshClient)
    );
  });

  it("rejects a partial canonical bootstrap containing application data", async () => {
    const client = temporaryDatabase();
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    const markerPosition = schemaSql.indexOf(
      "CREATE TABLE IF NOT EXISTS auctions"
    );
    expect(markerPosition).toBeGreaterThan(0);
    await client.executeMultiple(schemaSql.slice(0, markerPosition));
    await client.execute(
      "INSERT INTO users(id, email) VALUES ('live-user', 'live@example.test')"
    );
    const before = await databaseStructure(client);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow("Unsupported legacy schema");

    expect(await databaseStructure(client)).toEqual(before);
    const user = await client.execute(
      "SELECT id, email FROM users WHERE id = 'live-user'"
    );
    expect(user.rows).toEqual([
      { email: "live@example.test", id: "live-user" },
    ]);
    const tracking = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'schema_migrations'
    `);
    expect(tracking.rows).toEqual([]);
  });

  it("upgrades a supported legacy database without losing application data", async () => {
    const freshClient = temporaryDatabase();
    await deployDatabaseSchema(freshClient, { schemaPath, migrationsDir });
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);

    const result = await deployDatabaseSchema(client, {
      schemaPath,
      migrationsDir,
    });

    expect(result.mode).toBe("upgrade");
    expect(result.applied).toHaveLength(13);
    const player = await client.execute(
      "SELECT name, is_starter, is_favorite, integrity_value, has_fmv FROM players WHERE id = 7"
    );
    expect(player.rows[0]).toMatchObject({
      has_fmv: 0,
      integrity_value: 0,
      is_favorite: 0,
      is_starter: 0,
      name: "Legacy Player",
    });
    const timer = await client.execute(
      "SELECT last_reset_at FROM user_auction_response_timers WHERE auction_id = 5"
    );
    expect(Number(timer.rows[0].last_reset_at)).toBe(123);
    const openSessions = await client.execute(
      "SELECT session_start FROM user_sessions WHERE session_end IS NULL"
    );
    expect(openSessions.rows).toEqual([{ session_start: 200 }]);
    const requiredObjects = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE name IN (
        'scheduler_leases',
        'idx_auctions_league_player_active',
        'idx_user_sessions_unique_active',
        'idx_response_timers_status_deadline',
        'update_user_league_compliance_status_updated_at'
      )
    `);
    expect(new Set(requiredObjects.rows.map((row) => row.name))).toEqual(
      new Set([
        "scheduler_leases",
        "idx_auctions_league_player_active",
        "idx_user_sessions_unique_active",
        "idx_response_timers_status_deadline",
        "update_user_league_compliance_status_updated_at",
      ])
    );
    expect(await databaseStructure(client)).toEqual(
      await databaseStructure(freshClient)
    );
  });

  it("rejects an unsupported legacy baseline before creating migration metadata", async () => {
    const client = temporaryDatabase();
    await client.executeMultiple(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
      INSERT INTO users(id, email) VALUES ('too-old', 'too-old@example.test');
    `);
    const before = await databaseStructure(client);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow("Unsupported legacy schema");

    expect(await databaseStructure(client)).toEqual(before);
    const tracking = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'schema_migrations'
    `);
    expect(tracking.rows).toEqual([]);
  });

  it.each([
    {
      expectedIssue: "incompatible CHECK constraints on players",
      label: "CHECK expression",
      sql: supportedLegacyFixture.replace(
        "CHECK(role IN ('P', 'D', 'C', 'A'))",
        "CHECK(role IN ('P', 'D', 'C', 'A', 'X'))"
      ),
    },
    {
      expectedIssue:
        "incompatible UNIQUE constraints on user_auction_response_timers",
      label: "UNIQUE constraint",
      sql: supportedLegacyFixture.replace(
        /(CREATE TABLE user_auction_response_timers[^\n]*), UNIQUE\(auction_id, user_id\)/,
        "$1"
      ),
    },
    {
      expectedIssue: "incompatible generated columns on auction_leagues",
      label: "generated expression",
      sql: supportedLegacyFixture.replace(
        "GENERATED ALWAYS AS (slots_P + slots_D + slots_C + slots_A) STORED",
        "GENERATED ALWAYS AS (slots_P + slots_D + slots_C + slots_A + 1) STORED"
      ),
    },
  ])("rejects an incompatible $label before mutation", async ({
    expectedIssue,
    sql,
  }) => {
    expect(sql).not.toBe(supportedLegacyFixture);
    const client = temporaryDatabase();
    await client.executeMultiple(sql);
    const before = await databaseStructure(client);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow(`Unsupported legacy schema: ${expectedIssue}`);

    expect(await databaseStructure(client)).toEqual(before);
    const tracking = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'schema_migrations'
    `);
    expect(tracking.rows).toEqual([]);
  });

  it("rejects duplicate active auctions before applying metadata or schema changes", async () => {
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);
    await client.execute(`
      INSERT INTO auctions(
        id, auction_league_id, player_id, start_time, scheduled_end_time, status
      ) VALUES (6, 3, 7, 101, 201, 'closing')
    `);
    const before = await databaseStructure(client);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow(
      "Duplicate active/closing auctions prevent migration: league=3 player=7 auction_ids=5,6"
    );

    expect(await databaseStructure(client)).toEqual(before);
    const tracking = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'schema_migrations'
    `);
    expect(tracking.rows).toEqual([]);
    const playerColumns = await client.execute("PRAGMA table_info(players)");
    expect(playerColumns.rows.map((row) => row.name)).not.toContain(
      "is_starter"
    );
  });
  it("rejects a partial index with the expected shape but the wrong predicate before mutation", async () => {
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);
    await client.executeMultiple(`
      DROP INDEX idx_auctions_league_player;
      CREATE UNIQUE INDEX idx_auctions_league_player_active
        ON auctions(auction_league_id, player_id)
        WHERE status = 'active';
    `);
    const before = await databaseStructure(client);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow(
      "Unsupported legacy schema: incompatible index idx_auctions_league_player_active"
    );

    expect(await databaseStructure(client)).toEqual(before);
    const tracking = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name = 'schema_migrations'
    `);
    expect(tracking.rows).toEqual([]);
    const playerColumns = await client.execute("PRAGMA table_info(players)");
    expect(playerColumns.rows.map((row) => row.name)).not.toContain(
      "is_starter"
    );
  });

  it("is safe to run again after a completed deployment", async () => {
    const client = temporaryDatabase();
    await deployDatabaseSchema(client, { schemaPath, migrationsDir });
    const before = await client.execute(
      "SELECT sequence, file_name, checksum, source, applied_at FROM schema_migrations ORDER BY sequence"
    );

    const rerun = await deployDatabaseSchema(client, {
      schemaPath,
      migrationsDir,
    });
    const after = await client.execute(
      "SELECT sequence, file_name, checksum, source, applied_at FROM schema_migrations ORDER BY sequence"
    );

    expect(rerun.applied).toEqual([]);
    expect(after.rows).toEqual(before.rows);
  });

  it("resumes an interrupted additive migration whose first column already exists", async () => {
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);
    await client.execute(
      "ALTER TABLE players ADD COLUMN is_starter BOOLEAN DEFAULT 0"
    );

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).resolves.toMatchObject({ mode: "upgrade" });

    const playerColumns = await client.execute("PRAGMA table_info(players)");
    expect(playerColumns.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "is_starter",
        "is_favorite",
        "integrity_value",
        "has_fmv",
      ])
    );
    const tracked = await client.execute(
      "SELECT source FROM schema_migrations WHERE file_name = 'add_player_icons_columns.sql'"
    );
    expect(tracked.rows).toEqual([{ source: "migration" }]);
  });

  it("resumes an interrupted unique-index migration whose indexes already exist", async () => {
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);
    await client.executeMultiple(`
      DROP INDEX idx_auctions_league_player;
      CREATE UNIQUE INDEX idx_auctions_league_player_active
        ON auctions(auction_league_id, player_id)
        WHERE status IN ('active', 'closing');
      CREATE INDEX idx_auctions_league_player_general
        ON auctions(auction_league_id, player_id);
    `);

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).resolves.toMatchObject({ mode: "upgrade" });

    const tracked = await client.execute(`
      SELECT COUNT(*) AS count
      FROM schema_migrations
      WHERE file_name = 'add_unique_active_auction_constraint.sql'
    `);
    expect(tracked.rows).toEqual([{ count: 1 }]);
  });

  it("executes a final migration statement without a semicolon exactly once", async () => {
    const client = temporaryDatabase();
    const copiedMigrations = temporaryMigrationsCopy();
    await client.executeMultiple(supportedLegacyFixture);
    fs.appendFileSync(
      path.join(copiedMigrations, "add_hot_path_indexes.sql"),
      "\nUPDATE players SET name = name || '!' WHERE id = 7"
    );

    await expect(
      deployDatabaseSchema(client, {
        schemaPath,
        migrationsDir: copiedMigrations,
      })
    ).resolves.toMatchObject({ mode: "upgrade" });

    const player = await client.execute(
      "SELECT name FROM players WHERE id = 7"
    );
    expect(player.rows).toEqual([{ name: "Legacy Player!" }]);
    const tracking = await client.execute(`
      SELECT COUNT(*) AS count FROM schema_migrations
      WHERE file_name = 'add_hot_path_indexes.sql'
    `);
    expect(tracking.rows).toEqual([{ count: 1 }]);
  });

  it("detects checksum drift before replaying an applied migration", async () => {
    const client = temporaryDatabase();
    const copiedMigrations = temporaryMigrationsCopy();
    await deployDatabaseSchema(client, {
      schemaPath,
      migrationsDir: copiedMigrations,
    });
    const trackingBefore = await client.execute(
      "SELECT * FROM schema_migrations ORDER BY sequence"
    );
    fs.appendFileSync(
      path.join(copiedMigrations, "add_scheduler_leases.sql"),
      "\n-- unexpected post-deploy edit\n"
    );

    await expect(
      deployDatabaseSchema(client, {
        schemaPath,
        migrationsDir: copiedMigrations,
      })
    ).rejects.toThrow(
      "Drift detected: add_scheduler_leases.sql differs from the applied checksum"
    );
    const trackingAfter = await client.execute(
      "SELECT * FROM schema_migrations ORDER BY sequence"
    );
    expect(trackingAfter.rows).toEqual(trackingBefore.rows);
  });

  it.each([
    {
      expectedError: "schema_migrations has no file_name column",
      setup: `
        CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY);
        INSERT INTO schema_migrations(id) VALUES (1);
      `,
    },
    {
      expectedError:
        "Applied migration unknown-live-change.sql is absent from the manifest",
      setup: `
        CREATE TABLE schema_migrations (file_name TEXT NOT NULL UNIQUE);
        INSERT INTO schema_migrations(file_name) VALUES ('unknown-live-change.sql');
      `,
    },
  ])(
    "rejects a tracking-only database before applying the application schema: $expectedError",
    async ({ expectedError, setup }) => {
      const client = temporaryDatabase();
      await client.executeMultiple(setup);
      const schemaBefore = await client.execute(`
        SELECT type, name, sql FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);
      const rowsBefore = await client.execute(
        "SELECT COUNT(*) AS count FROM schema_migrations"
      );

      await expect(
        deployDatabaseSchema(client, { schemaPath, migrationsDir })
      ).rejects.toThrow(expectedError);

      const schemaAfter = await client.execute(`
        SELECT type, name, sql FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `);
      const rowsAfter = await client.execute(
        "SELECT COUNT(*) AS count FROM schema_migrations"
      );
      expect(schemaAfter.rows).toEqual(schemaBefore.rows);
      expect(rowsAfter.rows).toEqual(rowsBefore.rows);
    }
  );

  it("rejects unknown legacy tracking before evolving its metadata columns", async () => {
    const client = temporaryDatabase();
    const legacyFixture = fs.readFileSync(
      path.join(
        process.cwd(),
        "tests",
        "fixtures",
        "database",
        "legacy-pre-migrations.sql"
      ),
      "utf8"
    );
    await client.executeMultiple(legacyFixture);
    await client.executeMultiple(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      INSERT INTO schema_migrations(file_name) VALUES ('unknown-live-change.sql');
    `);
    const columnsBefore = await client.execute(
      "PRAGMA table_info(schema_migrations)"
    );

    await expect(
      deployDatabaseSchema(client, { schemaPath, migrationsDir })
    ).rejects.toThrow(
      "Applied migration unknown-live-change.sql is absent from the manifest"
    );

    const columnsAfter = await client.execute(
      "PRAGMA table_info(schema_migrations)"
    );
    expect(columnsAfter.rows).toEqual(columnsBefore.rows);
  });
});
