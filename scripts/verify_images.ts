import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

console.log("Starting Image Verification...");

const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;

// Initialize Client (Adapting from src/lib/db/index.ts logic)
// For verify script, we can just use the remote connection if env vars are present, or fail.
// But wait, the environment is local dev.
// Let's rely on the same config as the app.

if (!dbUrl || !dbToken) {
  console.error("Missing TURSO credentials in .env");
  process.exit(1);
}

const db = createClient({
  url: dbUrl,
  authToken: dbToken
});

async function run() {
  try {
    console.log("Fetching players...");
    const result = await db.execute("SELECT id, name, team FROM players WHERE team IS NOT NULL LIMIT 50");
    const players = result.rows as unknown as { id: number, name: string, team: string }[];

    let foundCount = 0;
    let missingCount = 0;

    console.log(`Checking ${players.length} players...`);

    const slugify = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    players.forEach(p => {
      const teamSlug = slugify(p.team || "");
      const playerSlug = slugify(p.name || "");

      // Adjusted path to look in standard implementation location relative to CWD
      const localPath = path.join(process.cwd(), "public", "seria_A", teamSlug, `${playerSlug}.webp`);

      if (fs.existsSync(localPath)) {
        console.log(`[OK] ${p.name} (${p.team}) -> Found: ${localPath}`);
        foundCount++;
      } else {
        // Try to list directory to see potential matches
        const teamDir = path.join(process.cwd(), "public", "seria_A", teamSlug);
        let hint = "";
        if (fs.existsSync(teamDir)) {
          const files = fs.readdirSync(teamDir);
          // Simple fuzzy match check
          const match = files.find(f => f.includes(playerSlug.split('-')[0]));
          if (match) hint = `(Did you mean: ${match}?)`;
        }

        console.log(`[MISSING] ${p.name} (${p.team}) -> Expected: ${localPath} ${hint}`);
        missingCount++;
      }
    });

    console.log("\n--- Summary ---");
    console.log(`Total Checked: ${players.length}`);
    console.log(`Found: ${foundCount}`);
    console.log(`Missing: ${missingCount}`);
    console.log(`Success Rate: ${((foundCount / players.length) * 100).toFixed(1)}%`);

  } catch (e) {
    console.error("Error:", e);
  }
}

run();
