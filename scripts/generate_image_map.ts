import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load env
dotenv.config({ path: ".env.local" });
if (!process.env.TURSO_DATABASE_URL) {
  dotenv.config({ path: ".env" });
}

// Config
const PUBLIC_DIR = path.join(process.cwd(), "public/seria_A");
const OUTPUT_FILE = path.join(process.cwd(), "src/lib/player_image_map.json");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function run() {
  try {
    console.log("Fetching all players from DB...");
    // Get all players that have a team assigned
    const result = await db.execute("SELECT name, team FROM players WHERE team IS NOT NULL");
    const players = result.rows as unknown as { name: string, team: string }[];

    const imageMap: Record<string, string> = {}; // "team-slug/player-slug": "filename.webp"
    let matched = 0;
    let total = 0;

    const slugify = (text: string) =>
      text.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    console.log(`Processing ${players.length} players...`);

    // Cache directory listings
    const teamFilesCache: Record<string, string[]> = {};

    for (const p of players) {
      total++;
      if (!p.team || !p.name) continue;

      const teamSlug = slugify(p.team);
      const playerSlug = slugify(p.name);
      const teamDir = path.join(PUBLIC_DIR, teamSlug);

      // Lazy load directory
      if (!teamFilesCache[teamSlug]) {
        if (fs.existsSync(teamDir)) {
          teamFilesCache[teamSlug] = fs.readdirSync(teamDir).filter(f => f.endsWith(".webp"));
        } else {
          teamFilesCache[teamSlug] = [];
        }
      }

      const files = teamFilesCache[teamSlug];
      if (files.length === 0) continue;

      // Strategy 1: Exact Match (adopo.webp)
      let match = files.find(f => f === `${playerSlug}.webp`);

      // Strategy 2: Ends With / Suffix Match (michel-adopo.webp ends with adopo.webp)
      // We check if filename (minus ext) ends with "-playerSlug"
      if (!match) {
        match = files.find(f => {
          const namePart = f.replace(".webp", "");
          return namePart === playerSlug || namePart.endsWith(`-${playerSlug}`);
        });
      }

      // Strategy 3: Contains (Ambiguous, but useful for reversed names or complex cases)
      // Use with caution or verify uniqueness? For now, stick to suffix as safer.

      if (match) {
        // Key: "teamSlug/playerSlug" -> Value: "matchFilename"
        // We only store the filename part relative to team dir?
        // Currently utils logic expects to build path.
        // Let's make utils look up this map.
        const key = `${teamSlug}/${playerSlug}`;
        imageMap[key] = match; // Just the filename, utils will prepend path
        matched++;
      }
    }

    console.log(`Generated Map with ${matched}/${total} matches.`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(imageMap, null, 2));
    console.log(`Map saved to ${OUTPUT_FILE}`);

  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

run();
