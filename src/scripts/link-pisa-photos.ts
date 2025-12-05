import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });

const PISA_PHOTOS_DIR = 'public/seria_A/pisa';

async function verifyAndLinkPisaPhotos() {
  const { db } = await import("../lib/db");

  console.log("Starting bulk update for Pisa players...");

  try {
    // 1. Get all files in directory
    const files = fs.readdirSync(PISA_PHOTOS_DIR);
    console.log(`Found ${files.length} photos in ${PISA_PHOTOS_DIR}`);

    // 2. Get all Pisa players from DB
    const playersResult = await db.execute({
      sql: "SELECT id, name, photo_url FROM players WHERE team = 'Pisa'",
      args: []
    });
    const players = playersResult.rows;
    console.log(`Found ${players.length} Pisa players in DB`);

    let updatedCount = 0;

    // 3. Match and Update
    for (const player of players) {
      const playerName = String(player.name).toLowerCase();

      // improved matching logic
      const matchingFile = files.find(file => {
        const f = file.toLowerCase();
        const cleanName = playerName.replace(/\./g, '').replace(/\s+/g, '-');

        // 1. Direct match or containment (e.g. "angori" in "samuele-angori")
        if (f.includes(cleanName)) return true;

        // 2. Handle "Surname I." format (e.g. "tramoni m." -> "matteo-tramoni")
        if (playerName.includes(' ')) {
          const parts = playerName.split(' ');
          const surname = parts[0].toLowerCase(); // "tramoni"
          // Check if filename contains the surname and ends with .webp
          if (f.includes(surname) && f.endsWith('.webp')) {
            // Optional: Verify strict surname match to avoid false positives?
            // For now, if "tramoni" is in "matteo-tramoni.webp", it's a good match.
            return true;
          }
        }

        return false;
      });

      if (matchingFile) {
        const newPhotoUrl = `/seria_A/pisa/${matchingFile}`;

        if (player.photo_url !== newPhotoUrl) {
          console.log(`Match found: ${player.name} -> ${matchingFile}`);

          await db.execute({
            sql: "UPDATE players SET photo_url = ? WHERE id = ?",
            args: [newPhotoUrl, player.id]
          });
          updatedCount++;
        } else {
          console.log(`Skipping ${player.name} (already linked)`);
        }
      } else {
        console.warn(`No photo found for: ${player.name}`);
      }
    }

    console.log(`\nOperation complete. Updated ${updatedCount} players.`);

  } catch (error) {
    console.error("Error linking photos:", error);
  }
}

verifyAndLinkPisaPhotos();
