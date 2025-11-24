
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

// Load env vars manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkCount() {
  try {
    const result = await db.execute("SELECT COUNT(*) as count FROM players");
    console.log("Total players in DB:", result.rows[0].count);
  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

checkCount();
