
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SERIA_A_DIR = path.join(PUBLIC_DIR, "seria_A");
const DB_PATH = path.join(process.cwd(), "database", "starter_default.db");

async function getDbClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url && authToken) {
    console.log("[Script] Connecting to Turso...");
    return createClient({ url, authToken });
  }

  console.log("[Script] No Turso credentials found. Attempting local file connection...");
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Local database file not found at: ${DB_PATH}`);
  }

  return createClient({
    url: `file:${DB_PATH}`,
  });
}

async function linkImages() {
  console.log("Starting image linking process...");

  if (!fs.existsSync(SERIA_A_DIR)) {
    console.error(`Directory not found: ${SERIA_A_DIR}`);
    process.exit(1);
  }

  const db = await getDbClient();

  // 1. Build a map of available images: Team -> [Files]
  const teamDirs = fs.readdirSync(SERIA_A_DIR).filter((file) => {
    return fs.statSync(path.join(SERIA_A_DIR, file)).isDirectory();
  });

  console.log(`Found ${teamDirs.length} team directories.`);

  const imageMap: Record<string, string[]> = {};
  for (const teamDir of teamDirs) {
    const files = fs.readdirSync(path.join(SERIA_A_DIR, teamDir));
    imageMap[teamDir] = files.filter((f) => f.endsWith(".webp") || f.endsWith(".png") || f.endsWith(".jpg"));
  }

  // 2. Fetch all players
  const result = await db.execute("SELECT id, name, team FROM players");
  const players = result.rows;
  console.log(`Fetched ${players.length} players from database.`);

  let updatedCount = 0;
  let unmatchedCount = 0;
  const unmatchedPlayers: { name: string; team: string; reason?: string }[] = [];

  // 3. Match players to images
  for (const player of players) {
    const playerId = player.id as number;
    const playerName = player.name as string;
    const playerTeam = player.team as string;

    // Skip dummy data
    if (playerName.startsWith("Player ") || playerName.startsWith("Repro Player")) {
      continue;
    }

    // Normalize team name
    let normalizedTeam = playerTeam.toLowerCase().replace(/\s+/g, "-");
    if (normalizedTeam === "verona") normalizedTeam = "hellas-verona";
    if (normalizedTeam === "inter-milano") normalizedTeam = "inter";

    const teamImages = imageMap[normalizedTeam];

    if (!teamImages) {
      unmatchedCount++;
      unmatchedPlayers.push({ name: playerName, team: playerTeam, reason: "Team folder not found" });
      continue;
    }

    // Normalize player name
    const playerSlug = playerName.toLowerCase().replace(/\s+/g, "-").replace(/['.]/g, "");

    // Matching Strategy
    let match = teamImages.find((img) => {
      const imgName = img.toLowerCase();
      // 1. Exact match
      if (imgName === `${playerSlug}.webp`) return true;
      // 2. Starts with (e.g. "name-date.webp")
      if (imgName.startsWith(`${playerSlug}-`)) return true;
      return false;
    });

    // 3. Ends with (e.g. "firstname-lastname.webp" matching "lastname")
    if (!match) {
      match = teamImages.find((img) => {
        const imgName = img.toLowerCase();
        return imgName.endsWith(`-${playerSlug}.webp`);
      });
    }

    // 4. Contains (fuzzy) - Only if unique match
    if (!match) {
      const fuzzyMatches = teamImages.filter((img) => {
        return img.toLowerCase().includes(playerSlug);
      });
      if (fuzzyMatches.length === 1) {
        match = fuzzyMatches[0];
      } else if (fuzzyMatches.length > 1) {
        // Ambiguous
        unmatchedCount++;
        unmatchedPlayers.push({ name: playerName, team: playerTeam, reason: `Ambiguous: ${fuzzyMatches.join(", ")}` });
        continue;
      }
    }

    // 5. Handle "Surname Initial." format (e.g. "Rossi F." or "Pellegrini Lo.")
    if (!match && /\s[A-Z][a-z]?\.$/.test(playerName)) {
      const surnameOnly = playerName.split(" ")[0].toLowerCase().replace(/['.]/g, "");
      // Try to match surname only
      const surnameMatches = teamImages.filter((img) => {
        return img.toLowerCase().includes(surnameOnly);
      });
      if (surnameMatches.length === 1) {
        match = surnameMatches[0];
      } else if (surnameMatches.length > 1) {
        // Check if any match starts with the initial?
        // e.g. "Rossi F." -> "francesco-rossi.webp" (starts with F)
        // But image is "firstname-lastname".
        // So "francesco-rossi" contains "rossi".
        // We can check if the part BEFORE the surname starts with the initial.
        // "francesco-rossi".split("-rossi")[0] -> "francesco". Starts with "f"? Yes.

        const initial = playerName.split(" ")[1][0].toLowerCase();
        const refinedMatches = surnameMatches.filter(img => {
          const parts = img.toLowerCase().split(surnameOnly);
          // parts[0] should be the first name (plus hyphens)
          if (parts[0] && parts[0].startsWith(initial)) return true;
          return false;
        });

        if (refinedMatches.length === 1) {
          match = refinedMatches[0];
        } else {
          unmatchedCount++;
          unmatchedPlayers.push({ name: playerName, team: playerTeam, reason: `Ambiguous Surname: ${surnameMatches.join(", ")}` });
          continue;
        }
      }
    }

    if (match) {
      const photoUrl = `/seria_A/${normalizedTeam}/${match}`;
      await db.execute({
        sql: "UPDATE players SET photo_url = ? WHERE id = ?",
        args: [photoUrl, playerId],
      });
      updatedCount++;
    } else {
      unmatchedCount++;
      unmatchedPlayers.push({ name: playerName, team: playerTeam, reason: "No match found" });
    }
  }

  console.log("\n---------------------------------------------------");
  console.log(`Process Complete.`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Unmatched: ${unmatchedCount}`);
  console.log("---------------------------------------------------");

  if (unmatchedPlayers.length > 0) {
    console.log("\nUnmatched Players (First 20):");
    unmatchedPlayers.slice(0, 20).forEach((p) => console.log(`- ${p.name} (${p.team}) [${p.reason}]`));

    const reportPath = path.join(process.cwd(), "unmatched_images_report.txt");
    const reportContent = unmatchedPlayers.map(p => `${p.name} (${p.team}) - ${p.reason}`).join("\n");
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\nFull list written to: ${reportPath}`);
  }
}

linkImages().catch((err) => {
  console.error("Error linking images:", err);
  process.exit(1);
});
