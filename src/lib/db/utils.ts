// src/lib/db/utils.ts
import { createClient, type Client } from "@libsql/client";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

type MigrationSource = "baseline" | "migration";

interface MigrationEntry {
  checksum: string;
  fileName: string;
  filePath: string;
  sequence: number;
}

interface MigrationManifest {
  baseline: string;
  migrations: string[];
}

interface ColumnStructure {
  defaultValue: unknown;
  hidden: number;
  name: string;
  notNull: number;
  primaryKey: number;
  type: string;
}

interface ForeignKeyStructure {
  from: unknown;
  onDelete: unknown;
  onUpdate: unknown;
  table: unknown;
  to: unknown;
}

interface TableStructure {
  checks: string[];
  columns: ColumnStructure[];
  foreignKeys: ForeignKeyStructure[];
  generated: string[];
  name: string;
  uniqueConstraints: unknown[][];
}

interface IndexStructure {
  columns: unknown[];
  name: string;
  partial: number;
  sql: string;
  table: string;
  unique: number;
}

interface TriggerStructure {
  name: string;
  sql: string;
  table: string;
}

interface DatabaseStructure {
  indexes: IndexStructure[];
  tables: TableStructure[];
  triggers: TriggerStructure[];
}

const LEGACY_MISSING_TABLES = new Set([
  "scheduler_leases",
  "user_player_preferences",
]);
const LEGACY_MISSING_COLUMNS = new Map<string, Set<string>>([
  [
    "players",
    new Set(["has_fmv", "integrity_value", "is_favorite", "is_starter"]),
  ],
  ["auctions", new Set(["user_auction_states"])],
  ["user_auction_response_timers", new Set(["last_reset_at"])],
  ["user_sessions", new Set(["last_heartbeat"])],
  ["user_player_preferences", new Set(["expires_at", "preference_type"])],
]);
const LEGACY_MISSING_INDEXES = new Set([
  "idx_assignments_league",
  "idx_auctions_league_player_active",
  "idx_auctions_league_player_general",
  "idx_auto_bids_auction_user_active",
  "idx_bids_auction_user",
  "idx_participants_league_user",
  "idx_response_timers_status_deadline",
  "idx_response_timers_user_status",
  "idx_user_player_preferences_player_league",
  "idx_user_player_preferences_user_league",
  "idx_user_sessions_heartbeat",
  "idx_user_sessions_unique_active",
  "idx_user_sessions_user_open",
]);
const LEGACY_EXTRA_INDEXES = new Set(["idx_auctions_league_player"]);
const COMPLIANCE_TRIGGER =
  "update_user_league_compliance_status_updated_at";

export interface DatabaseDeploymentOptions {
  migrationsDir?: string;
  schemaPath?: string;
}

export interface DatabaseDeploymentResult {
  applied: string[];
  baseline: string;
  mode: "baseline" | "upgrade";
}

function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function normalizeTriggerSql(sql: unknown): string {
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

function tableConstraintSignatures(sql: unknown): {
  checks: string[];
  generated: string[];
} {
  const normalized = normalizeTriggerSql(sql);
  return {
    checks: parenthesizedExpressions(normalized, /\bcheck\s*\(/g),
    generated: parenthesizedExpressions(
      normalized,
      /\bgenerated\s+always\s+as\s*\(/g
    ),
  };
}

async function readDatabaseStructure(
  client: Client
): Promise<DatabaseStructure> {
  const objects = await client.execute(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      AND name <> 'schema_migrations'
      AND type IN ('table', 'index', 'trigger')
    ORDER BY type, name
  `);
  const tableNames = objects.rows
    .filter((row) => row.type === "table")
    .map((row) => String(row.name));

  const tables = await Promise.all(
    tableNames.map(async (tableName): Promise<TableStructure> => {
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
            defaultValue: row.dflt_value ?? null,
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
          .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
        name: tableName,
        uniqueConstraints: uniqueConstraints.sort((left, right) =>
          stableJson(left).localeCompare(stableJson(right))
        ),
      };
    })
  );

  const indexes = await Promise.all(
    objects.rows
      .filter((row) => row.type === "index" && row.sql !== null)
      .map(async (row): Promise<IndexStructure> => {
        const name = String(row.name);
        const table = String(row.tbl_name);
        const columns = await client.execute(
          `PRAGMA index_info(${quoteSqlIdentifier(name)})`
        );
        const indexList = await client.execute(
          `PRAGMA index_list(${quoteSqlIdentifier(table)})`
        );
        const metadata = indexList.rows.find((index) => index.name === row.name);
        return {
          columns: columns.rows.map((column) => column.name),
          name,
          partial: Number(metadata?.partial),
          table,
          sql: normalizeTriggerSql(row.sql),
          unique: Number(metadata?.unique),
        };
      })
  );

  const triggers = objects.rows
    .filter((row) => row.type === "trigger")
    .map(
      (row): TriggerStructure => ({
        name: String(row.name),
        sql: normalizeTriggerSql(row.sql),
        table: String(row.tbl_name),
      })
    );

  return { indexes, tables, triggers };
}

async function readCanonicalStructure(
  schemaPath: string
): Promise<DatabaseStructure> {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`[Migration Util] Schema file not found at ${schemaPath}`);
  }
  const reference = createClient({ url: "file::memory:" });
  try {
    await reference.executeMultiple(fs.readFileSync(schemaPath, "utf8"));
    return await readDatabaseStructure(reference);
  } finally {
    await reference.close();
  }
}

function unsupportedLegacyIssues(
  actual: DatabaseStructure,
  expected: DatabaseStructure
): string[] {
  const issues: string[] = [];
  const actualTables = new Map(actual.tables.map((table) => [table.name, table]));
  const expectedTables = new Map(
    expected.tables.map((table) => [table.name, table])
  );

  for (const tableName of expectedTables.keys()) {
    if (!actualTables.has(tableName) && !LEGACY_MISSING_TABLES.has(tableName)) {
      issues.push(`missing required table ${tableName}`);
    }
  }
  for (const tableName of actualTables.keys()) {
    if (!expectedTables.has(tableName)) {
      issues.push(`unexpected table ${tableName}`);
    }
  }

  for (const [tableName, expectedTable] of expectedTables) {
    const actualTable = actualTables.get(tableName);
    if (!actualTable) continue;
    const actualColumns = new Map(
      actualTable.columns.map((column) => [column.name, column])
    );
    const expectedColumns = new Map(
      expectedTable.columns.map((column) => [column.name, column])
    );
    const allowedMissing = LEGACY_MISSING_COLUMNS.get(tableName) ?? new Set();

    for (const [columnName, expectedColumn] of expectedColumns) {
      const actualColumn = actualColumns.get(columnName);
      if (!actualColumn) {
        if (!allowedMissing.has(columnName)) {
          issues.push(`missing required column ${tableName}.${columnName}`);
        }
        continue;
      }
      if (stableJson(actualColumn) !== stableJson(expectedColumn)) {
        issues.push(`incompatible column ${tableName}.${columnName}`);
      }
    }
    for (const columnName of actualColumns.keys()) {
      if (!expectedColumns.has(columnName)) {
        issues.push(`unexpected column ${tableName}.${columnName}`);
      }
    }
    if (stableJson(actualTable.foreignKeys) !== stableJson(expectedTable.foreignKeys)) {
      issues.push(`incompatible foreign keys on ${tableName}`);
    }
    if (stableJson(actualTable.checks) !== stableJson(expectedTable.checks)) {
      issues.push(`incompatible CHECK constraints on ${tableName}`);
    }
    if (
      stableJson(actualTable.generated) !== stableJson(expectedTable.generated)
    ) {
      issues.push(`incompatible generated columns on ${tableName}`);
    }
    if (
      stableJson(actualTable.uniqueConstraints) !==
      stableJson(expectedTable.uniqueConstraints)
    ) {
      issues.push(`incompatible UNIQUE constraints on ${tableName}`);
    }
  }

  const actualIndexes = new Map(actual.indexes.map((index) => [index.name, index]));
  const expectedIndexes = new Map(
    expected.indexes.map((index) => [index.name, index])
  );
  for (const [indexName, expectedIndex] of expectedIndexes) {
    const actualIndex = actualIndexes.get(indexName);
    if (!actualIndex) {
      if (!LEGACY_MISSING_INDEXES.has(indexName)) {
        issues.push(`missing required index ${indexName}`);
      }
    } else if (stableJson(actualIndex) !== stableJson(expectedIndex)) {
      issues.push(`incompatible index ${indexName}`);
    }
  }
  for (const indexName of actualIndexes.keys()) {
    if (!expectedIndexes.has(indexName) && !LEGACY_EXTRA_INDEXES.has(indexName)) {
      issues.push(`unexpected index ${indexName}`);
    }
  }

  const actualTriggers = new Map(
    actual.triggers.map((trigger) => [trigger.name, trigger])
  );
  const expectedTriggers = new Map(
    expected.triggers.map((trigger) => [trigger.name, trigger])
  );
  for (const [triggerName, expectedTrigger] of expectedTriggers) {
    const actualTrigger = actualTriggers.get(triggerName);
    if (!actualTrigger) {
      if (triggerName !== COMPLIANCE_TRIGGER) {
        issues.push(`missing required trigger ${triggerName}`);
      }
    } else if (
      triggerName !== COMPLIANCE_TRIGGER &&
      stableJson(actualTrigger) !== stableJson(expectedTrigger)
    ) {
      issues.push(`incompatible trigger ${triggerName}`);
    }
  }
  for (const triggerName of actualTriggers.keys()) {
    if (!expectedTriggers.has(triggerName)) {
      issues.push(`unexpected trigger ${triggerName}`);
    }
  }

  return issues;
}

function structuresMatch(
  actual: DatabaseStructure,
  expected: DatabaseStructure
): boolean {
  return stableJson(actual) === stableJson(expected);
}

function isCanonicalStructureSubset(
  actual: DatabaseStructure,
  expected: DatabaseStructure
): boolean {
  const expectedTables = new Map(
    expected.tables.map((table) => [table.name, table])
  );
  const expectedIndexes = new Map(
    expected.indexes.map((index) => [index.name, index])
  );
  const expectedTriggers = new Map(
    expected.triggers.map((trigger) => [trigger.name, trigger])
  );
  return (
    actual.tables.every(
      (table) =>
        stableJson(table) === stableJson(expectedTables.get(table.name))
    ) &&
    actual.indexes.every(
      (index) =>
        stableJson(index) === stableJson(expectedIndexes.get(index.name))
    ) &&
    actual.triggers.every(
      (trigger) =>
        stableJson(trigger) === stableJson(expectedTriggers.get(trigger.name))
    )
  );
}

async function hasApplicationData(
  client: Client,
  structure: DatabaseStructure
): Promise<boolean> {
  for (const table of structure.tables) {
    const row = await client.execute(
      `SELECT 1 FROM ${quoteSqlIdentifier(table.name)} LIMIT 1`
    );
    if (row.rows.length > 0) return true;
  }
  return false;
}

async function hasMigrationTrackingTable(client: Client): Promise<boolean> {
  const table = await client.execute(`
    SELECT 1 FROM sqlite_schema
    WHERE type = 'table' AND name = 'schema_migrations'
  `);
  return table.rows.length > 0;
}

async function assertMigrationHistoryPreflight(
  client: Client,
  entries: MigrationEntry[]
): Promise<void> {
  const table = await client.execute(`
    SELECT 1 FROM sqlite_schema
    WHERE type = 'table' AND name = 'schema_migrations'
  `);
  if (table.rows.length === 0) return;

  const columns = await client.execute("PRAGMA table_info(schema_migrations)");
  const names = new Set(columns.rows.map((row) => String(row.name)));
  if (!names.has("file_name")) {
    throw new Error(
      "[Migration Util] Drift detected: schema_migrations has no file_name column."
    );
  }
  const sequenceExpression = names.has("sequence")
    ? "sequence"
    : "NULL AS sequence";
  const checksumExpression = names.has("checksum")
    ? "checksum"
    : "NULL AS checksum";
  const applied = await client.execute(
    `SELECT file_name, ${sequenceExpression}, ${checksumExpression} FROM schema_migrations`
  );
  const byName = new Map(entries.map((entry) => [entry.fileName, entry]));
  for (const row of applied.rows) {
    const fileName = String(row.file_name);
    const entry = byName.get(fileName);
    if (!entry) {
      throw new Error(
        `[Migration Util] Applied migration ${fileName} is absent from the manifest.`
      );
    }
    if (row.checksum !== null && String(row.checksum) !== entry.checksum) {
      throw new Error(
        `[Migration Util] Drift detected: ${fileName} differs from the applied checksum.`
      );
    }
    if (row.sequence !== null && Number(row.sequence) !== entry.sequence) {
      throw new Error(
        `[Migration Util] Drift detected: ${fileName} changed sequence.`
      );
    }
  }
}

async function assertNoDuplicateActiveAuctions(client: Client): Promise<void> {
  const duplicates = await client.execute(`
    SELECT
      auction_league_id,
      player_id,
      GROUP_CONCAT(id) AS auction_ids
    FROM (
      SELECT id, auction_league_id, player_id
      FROM auctions
      WHERE status IN ('active', 'closing')
      ORDER BY id
    ) ordered_auctions
    GROUP BY auction_league_id, player_id
    HAVING COUNT(*) > 1
    ORDER BY auction_league_id, player_id
  `);
  if (duplicates.rows.length === 0) return;

  const details = duplicates.rows
    .map(
      (row) =>
        `league=${row.auction_league_id} player=${row.player_id} auction_ids=${row.auction_ids}`
    )
    .join("; ");
  throw new Error(
    `[Migration Util] Duplicate active/closing auctions prevent migration: ${details}. Resolve duplicate auctions before retrying.`
  );
}

function splitMigrationStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let inTrigger = false;

  for (const rawLine of sql.split("\n")) {
    const line = rawLine.trimStart().startsWith("--") ? "" : rawLine;
    buffer += `${line}\n`;
    if (!inTrigger && /^\s*CREATE\s+TRIGGER\b/i.test(buffer)) {
      inTrigger = true;
    }

    if (inTrigger) {
      if (/^\s*END\s*;\s*$/i.test(line)) {
        statements.push(buffer.trim().replace(/;\s*$/, ""));
        buffer = "";
        inTrigger = false;
      }
      continue;
    }

    const pieces = buffer.split(";");
    buffer = pieces.pop() ?? "";
    statements.push(
      ...pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 0)
    );
  }

  if (buffer.trim().length > 0) {
    statements.push(buffer.trim());
  }
  return statements;
}

async function skipCompletedAddColumnStatements(
  client: Client,
  statements: string[]
): Promise<string[]> {
  const executable: string[] = [];
  for (const statement of statements) {
    const addColumn = statement.match(
      /^\s*ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+(?:COLUMN\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/i
    );
    if (!addColumn) {
      executable.push(statement);
      continue;
    }

    const [, tableName, columnName] = addColumn;
    const columns = await client.execute(`PRAGMA table_info(${tableName})`);
    const exists = columns.rows.some(
      (row) => String(row.name).toLowerCase() === columnName.toLowerCase()
    );
    if (!exists) {
      executable.push(statement);
    }
  }
  return executable;
}

function loadMigrationEntries(migrationsDir: string): {
  baseline: string;
  entries: MigrationEntry[];
} {
  const manifestPath = path.join(migrationsDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[Migration Util] Manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8")
  ) as MigrationManifest;
  if (
    typeof manifest.baseline !== "string" ||
    !Array.isArray(manifest.migrations)
  ) {
    throw new Error("[Migration Util] Invalid migration manifest.");
  }

  const listed = new Set(manifest.migrations);
  if (listed.size !== manifest.migrations.length) {
    throw new Error("[Migration Util] Migration manifest contains duplicates.");
  }
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"));
  const missing = manifest.migrations.filter(
    (fileName) => !fs.existsSync(path.join(migrationsDir, fileName))
  );
  const unlisted = sqlFiles.filter((fileName) => !listed.has(fileName));
  if (missing.length > 0 || unlisted.length > 0) {
    throw new Error(
      `[Migration Util] Manifest mismatch (missing: ${missing.join(", ") || "none"}; unlisted: ${unlisted.join(", ") || "none"}).`
    );
  }

  return {
    baseline: manifest.baseline,
    entries: manifest.migrations.map((fileName, index) => {
      const filePath = path.join(migrationsDir, fileName);
      return {
        checksum: migrationChecksum(fs.readFileSync(filePath, "utf8")),
        fileName,
        filePath,
        sequence: index + 1,
      };
    }),
  };
}

async function ensureMigrationTracking(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence INTEGER,
      file_name TEXT NOT NULL UNIQUE,
      checksum TEXT,
      source TEXT NOT NULL DEFAULT 'migration' CHECK(source IN ('baseline', 'migration')),
      baseline TEXT,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  const columns = await client.execute("PRAGMA table_info(schema_migrations)");
  const names = new Set(columns.rows.map((row) => String(row.name)));
  if (!names.has("sequence")) {
    await client.execute("ALTER TABLE schema_migrations ADD COLUMN sequence INTEGER");
  }
  if (!names.has("checksum")) {
    await client.execute("ALTER TABLE schema_migrations ADD COLUMN checksum TEXT");
  }
  if (!names.has("source")) {
    await client.execute(
      "ALTER TABLE schema_migrations ADD COLUMN source TEXT NOT NULL DEFAULT 'migration'"
    );
  }
  if (!names.has("baseline")) {
    await client.execute("ALTER TABLE schema_migrations ADD COLUMN baseline TEXT");
  }
}

async function isEmptyApplicationDatabase(client: Client): Promise<boolean> {
  const tables = await client.execute(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> 'schema_migrations'
  `);
  return tables.rows.length === 0;
}

async function reconcileMigrationMetadata(
  client: Client,
  entries: MigrationEntry[]
): Promise<void> {
  const applied = await client.execute(
    "SELECT file_name, sequence, checksum FROM schema_migrations"
  );
  const byName = new Map(entries.map((entry) => [entry.fileName, entry]));
  for (const row of applied.rows) {
    const fileName = String(row.file_name);
    const entry = byName.get(fileName);
    if (!entry) {
      throw new Error(
        `[Migration Util] Applied migration ${fileName} is absent from the manifest.`
      );
    }
    if (row.checksum !== null && String(row.checksum) !== entry.checksum) {
      throw new Error(
        `[Migration Util] Drift detected: ${fileName} differs from the applied checksum.`
      );
    }
    if (row.sequence !== null && Number(row.sequence) !== entry.sequence) {
      throw new Error(
        `[Migration Util] Drift detected: ${fileName} changed sequence.`
      );
    }
    if (row.checksum === null || row.sequence === null) {
      await client.execute({
        sql: "UPDATE schema_migrations SET sequence = ?, checksum = ? WHERE file_name = ?",
        args: [entry.sequence, entry.checksum, fileName],
      });
    }
  }
}

async function recordCurrentBaseline(
  client: Client,
  entries: MigrationEntry[],
  baseline: string
): Promise<void> {
  if (entries.length === 0) return;
  await client.batch(
    entries.map((entry) => ({
      sql: `INSERT INTO schema_migrations
              (sequence, file_name, checksum, source, baseline)
            VALUES (?, ?, ?, 'baseline', ?)`,
      args: [entry.sequence, entry.fileName, entry.checksum, baseline],
    })),
    "write"
  );
}

/**
 * Applica un file di schema SQL a un'istanza di database fornita.
 * @param client L'istanza del client @libsql/client.
 * @param schemaFilePath Il percorso al file .sql dello schema.
 */
export async function applySchemaToDb(
  client: Client,
  schemaFilePath: string
): Promise<void> {
  console.log(
    `[Schema Apply Util] Attempting to apply schema from: ${schemaFilePath}`
  );
  if (!fs.existsSync(schemaFilePath)) {
    const errorMessage = `[Schema Apply Util] Error: Schema file not found at ${schemaFilePath}. Cannot apply schema.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
    if (schemaSql.trim() === "") {
      console.warn(
        `[Schema Apply Util] Schema file (${schemaFilePath}) is empty. No schema applied.`
      );
      return;
    }

    console.log(`[Schema Apply Util] Executing SQL from ${schemaFilePath}...`);

    // @libsql/client supporta executeMultiple per eseguire script SQL completi
    await client.executeMultiple(schemaSql);

    // CREATE TABLE IF NOT EXISTS non aggiunge colonne nuove a una tabella
    // esistente: guardia idempotente per DB creati prima che
    // user_player_preferences avesse preference_type/expires_at.
    const preferenceColumns = await client.execute(
      "PRAGMA table_info(user_player_preferences)"
    );
    const names = new Set(preferenceColumns.rows.map((row) => String(row.name)));
    if (!names.has("preference_type")) {
      await client.execute(
        "ALTER TABLE user_player_preferences ADD COLUMN preference_type TEXT DEFAULT 'preference'"
      );
    }
    if (!names.has("expires_at")) {
      await client.execute(
        "ALTER TABLE user_player_preferences ADD COLUMN expires_at INTEGER"
      );
    }

    console.log("[Schema Apply Util] Schema SQL applied successfully.");
  } catch (error) {
    console.error(
      `[Schema Apply Util] Error applying schema SQL from ${schemaFilePath}:`,
      error
    );
    throw error;
  }
}

/**
 * Applica un singolo file di migrazione in una transazione atomica.
 * La migrazione viene registrata in `schema_migrations` nella STESSA transazione,
 * così il tracking è atomico con l'applicazione (niente re-apply parziali).
 * Usa `client.batch` (supportato sia su file che su Turso remoto), NON
 * `BEGIN`/`COMMIT` manuali via `client.execute` (su HTTP ogni execute() è una
 * richiesta separata, lo stato della transazione non è garantito).
 */
export async function applyMigrationFile(
  client: Client,
  filePath: string,
  metadata?: Pick<MigrationEntry, "checksum" | "sequence">
): Promise<void> {
  const fileName = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Migration Util] Migration file not found at ${filePath}`);
  }

  await ensureMigrationTracking(client);

  const alreadyApplied = await client.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE file_name = ?",
    args: [fileName],
  });
  if (alreadyApplied.rows.length > 0) {
    console.log(
      `[Migration Util] Migration ${fileName} already applied, skipping.`
    );
    return;
  }

  const sql = fs.readFileSync(filePath, "utf8");
  if (sql.trim() === "") {
    console.warn(`[Migration Util] Migration file (${fileName}) is empty. Skipping.`);
    return;
  }

  // Mantiene i blocchi CREATE TRIGGER indivisibili: i ';' nel corpo BEGIN/END
  // non delimitano statement indipendenti.
  const statements = await skipCompletedAddColumnStatements(
    client,
    splitMigrationStatements(sql)
  );

  try {
    await client.batch(
      [
        ...statements,
        {
          sql: `INSERT INTO schema_migrations
                  (sequence, file_name, checksum, source)
                VALUES (?, ?, ?, ?)`,
          args: [
            metadata?.sequence ?? null,
            fileName,
            metadata?.checksum ?? migrationChecksum(sql),
            "migration" satisfies MigrationSource,
          ],
        },
      ],
      "write"
    );
    console.log(`[Migration Util] Applied migration ${fileName}.`);
  } catch (error) {
    console.error(
      `[Migration Util] Error applying migration ${fileName}, rolled back:`,
      error
    );
    throw error;
  }
}

/**
 * Applica tutte le migrazioni nell'ordine versionato dal manifest.
 * Ogni migrazione è tracciata in `schema_migrations` (skip se già applicata).
 */
export async function runMigrations(
  client: Client,
  migrationsDir = path.join(process.cwd(), "database", "migrations")
): Promise<string[]> {
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[Migration Util] Migrations dir not found at ${migrationsDir}.`);
    return [];
  }
  const { entries } = loadMigrationEntries(migrationsDir);
  await assertMigrationHistoryPreflight(client, entries);
  await ensureMigrationTracking(client);
  await reconcileMigrationMetadata(client, entries);
  const applied: string[] = [];
  for (const entry of entries) {
    const tracked = await client.execute({
      sql: "SELECT 1 FROM schema_migrations WHERE file_name = ?",
      args: [entry.fileName],
    });
    if (tracked.rows.length === 0) {
      await applyMigrationFile(client, entry.filePath, entry);
      applied.push(entry.fileName);
    }
  }
  return applied;
}

/**
 * Public deployment seam used by both the CLI and CI integration tests.
 * Empty databases are created from the current snapshot and marked at the
 * manifest baseline; existing databases advance through the ordered history.
 */
export async function deployDatabaseSchema(
  client: Client,
  options: DatabaseDeploymentOptions = {}
): Promise<DatabaseDeploymentResult> {
  const schemaPath =
    options.schemaPath ?? path.join(process.cwd(), "database", "schema.sql");
  const migrationsDir =
    options.migrationsDir ??
    path.join(process.cwd(), "database", "migrations");
  const { baseline, entries } = loadMigrationEntries(migrationsDir);
  const expectedStructure = await readCanonicalStructure(schemaPath);
  await assertMigrationHistoryPreflight(client, entries);
  const empty = await isEmptyApplicationDatabase(client);

  if (empty) {
    await applySchemaToDb(client, schemaPath);
    const bootstrappedStructure = await readDatabaseStructure(client);
    if (!structuresMatch(bootstrappedStructure, expectedStructure)) {
      throw new Error(
        "[Migration Util] Fresh bootstrap did not match the canonical schema."
      );
    }
    await ensureMigrationTracking(client);
    await recordCurrentBaseline(client, entries, baseline);
    return { applied: [], baseline, mode: "baseline" };
  }

  const initialStructure = await readDatabaseStructure(client);
  if (
    isCanonicalStructureSubset(initialStructure, expectedStructure) &&
    !(await hasMigrationTrackingTable(client)) &&
    !(await hasApplicationData(client, initialStructure))
  ) {
    await applySchemaToDb(client, schemaPath);
    const recoveredStructure = await readDatabaseStructure(client);
    if (!structuresMatch(recoveredStructure, expectedStructure)) {
      throw new Error(
        "[Migration Util] Partial bootstrap recovery did not match the canonical schema."
      );
    }
    await ensureMigrationTracking(client);
    await recordCurrentBaseline(client, entries, baseline);
    return { applied: [], baseline, mode: "baseline" };
  }

  const legacyIssues = unsupportedLegacyIssues(
    initialStructure,
    expectedStructure
  );
  if (legacyIssues.length > 0) {
    throw new Error(
      `[Migration Util] Unsupported legacy schema: ${legacyIssues.join("; ")}`
    );
  }
  await assertNoDuplicateActiveAuctions(client);

  const applied = await runMigrations(client, migrationsDir);
  await applySchemaToDb(client, schemaPath);
  const upgradedStructure = await readDatabaseStructure(client);
  if (!structuresMatch(upgradedStructure, expectedStructure)) {
    throw new Error(
      "[Migration Util] Schema convergence failed after applying migrations."
    );
  }
  return { applied, baseline, mode: "upgrade" };
}
