import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!process.env.TURSO_DATABASE_URL) {
  dotenv.config({ path: ".env" });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function run() {
  try {
    const result = await db.execute("SELECT id, name, team FROM players WHERE name LIKE '%Adopo%' OR name LIKE '%Adzic%' OR name LIKE '%Aebischer%';");
    console.table(result.rows);
  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

run();
