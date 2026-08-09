// src/lib/db/utils.ts
import type { Client } from "@libsql/client";
import fs from "fs";
import path from "path";

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
  filePath: string
): Promise<void> {
  const fileName = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[Migration Util] Migration file not found at ${filePath}`);
  }

  // La tabella di tracking è idempotente; viene creata se non esiste.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

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

  // Rimuove i commenti -- riga per riga, poi spezza su ';' in singoli
  // statement (niente vuoti) e li esegue in un batch atomico insieme alla
  // registrazione del tracking.
  const withoutComments = sql
    .split("\n")
    .map((line) => (line.trimStart().startsWith("--") ? "" : line))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  try {
    await client.batch(
      [
        ...statements,
        { sql: "INSERT INTO schema_migrations (file_name) VALUES (?)", args: [fileName] },
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
 * Applica tutte le migrazioni da `database/migrations/` in ordine alfabetico.
 * Ogni migrazione è tracciata in `schema_migrations` (skip se già applicata).
 */
export async function runMigrations(client: Client): Promise<void> {
  const migrationsDir = path.join(process.cwd(), "database", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[Migration Util] Migrations dir not found at ${migrationsDir}.`);
    return;
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await applyMigrationFile(client, path.join(migrationsDir, file));
  }
}
