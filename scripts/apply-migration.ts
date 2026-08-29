/**
 * Applica una migration manualmente al DB Turso (statement per statement).
 *
 * Serve perché `pnpm db:migrate` fallisce con "Unsupported legacy schema"
 * (CHECK constraint storiche) prima di applicare qualsiasi migration.
 *
 * Uso:
 *   pnpm exec tsx scripts/apply-migration.ts database/migrations/add_event_outbox.sql
 *
 * Le credenziali vengono lette da .env.local (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const file = process.argv[2];
if (!file) {
  console.error("Uso: pnpm exec tsx scripts/apply-migration.ts <file.sql>");
  process.exit(1);
}

let sql = fs.readFileSync(file, "utf8");
// Rimuovi commenti a riga singola (--) per non spezzare lo split
sql = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const stmts = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

(async () => {
  for (const s of stmts) {
    try {
      await db.execute(s);
      console.log("OK:", s.replace(/\s+/g, " ").slice(0, 70));
    } catch (e: any) {
      console.error("ERR:", e.message, "| stmt:", s.replace(/\s+/g, " ").slice(0, 70));
      process.exitCode = 1;
    }
  }
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  console.log("Tabelle presenti:", (tables.rows as any[]).map((r) => r.name).join(", "));
})();
