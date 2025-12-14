import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables (prioritize .env.local)
dotenv.config({ path: ".env.local" });
if (!process.env.TURSO_DATABASE_URL) {
  dotenv.config({ path: ".env" });
}

console.log("Starting Image Verification (Turso)...");

const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
  console.error("❌ CRITICAL: Missing TURSO credentials in .env.local or .env");
  console.error("Please ensure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set.");
  process.exit(1);
}

const db = createClient({
  url: dbUrl,
  authToken: dbToken
});

async function run() {
  try {
    console.log("📡 Connecting to Turso...");
    // Sample standard teams to avoid seed data
    const query = `
            SELECT id, name, team, photo_url
            FROM players
            WHERE team IN ('atalanta', 'inter', 'milan', 'juventus', 'napoli', 'roma', 'bologna', 'fiorentina')
            ORDER BY team, name
            LIMIT 50
        `;
    const result = await db.execute(query);
    const players = result.rows as unknown as { id: number, name: string, team: string, photo_url: string }[];

    if (players.length === 0) {
      console.log("⚠️ No players found in standard teams. Checking any team...");
      const fallbackResult = await db.execute("SELECT id, name, team FROM players WHERE team IS NOT NULL LIMIT 20");
      // @ts-ignore
      players.push(...fallbackResult.rows);
    }

    let foundCount = 0;
    let missingCount = 0;
    let dbUrlCount = 0;

    console.log(`\n🔍 Checking linkage for ${players.length} players...\n`);

    const slugify = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

    for (const p of players) {
      const teamSlug = slugify(p.team || "");
      const playerSlug = slugify(p.name || "");

      // Expected Local Path
      const relativePath = `public/seria_A/${teamSlug}/${playerSlug}.webp`;
      const absolutePath = path.join(process.cwd(), relativePath);

      const hasLocal = fs.existsSync(absolutePath);
      const hasDbUrl = p.photo_url && p.photo_url.length > 5;

      let status = "";
      if (hasDbUrl) {
        status = "✅ [DB URL]";
        dbUrlCount++;
      } else if (hasLocal) {
        status = "✅ [LOCAL]";
        foundCount++;
      } else {
        status = "❌ [MISSING]";
        missingCount++;
      }

      console.log(`${status.padEnd(12)} ${p.name.padEnd(25)} (${p.team})`);
      if (!hasDbUrl && !hasLocal) {
        console.log(`   -> Expected Local: ${relativePath}`);
      }
    }

    console.log("\n--- Verification Summary ---");
    console.log(`Total Checked: ${players.length}`);
    console.log(`Strategy 'DB URL' (Priority 1): ${dbUrlCount}`);
    console.log(`Strategy 'Local File' (Priority 2): ${foundCount}`);
    console.log(`Failures (Will use Fallback ID): ${missingCount}`);

    if (missingCount === 0) {
      console.log("\n🎉 ALL CLEAR! Every player has a valid image source.");
    } else {
      console.log(`\n⚠️ ${missingCount} players will rely on the Remote ID fallback (Fantacalcio API).`);
    }

  } catch (e) {
    console.error("Error executing query:", e);
  } finally {
    db.close();
  }
}

run();
