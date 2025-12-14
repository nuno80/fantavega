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
    const names = ["Akanji", "Akpa Akpro", "Adopo", "Adzic", "Aebischer"];
    const placeholders = names.map(() => "?").join(",");
    const query = `SELECT id, name, team, photo_url FROM players WHERE name IN (${placeholders})`;

    const result = await db.execute({
      sql: query,
      args: names
    });

    console.table(result.rows);
  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

run();
