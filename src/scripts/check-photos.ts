
import { db } from "@/lib/db";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function checkPlayerPhotos() {
  try {
    console.log("Checking DB connection with credentials from .env.local...");
    const result = await db.execute("SELECT id, name, role, team, photo_url FROM players WHERE photo_url IS NOT NULL LIMIT 5");
    console.log("Players with photos:");
    console.table(result.rows);

    const countResult = await db.execute("SELECT COUNT(*) as count FROM players");
    console.log(`Total players: ${countResult.rows[0].count}`);

    const countNull = await db.execute("SELECT COUNT(*) as count FROM players WHERE photo_url IS NULL OR photo_url = ''");
    console.log(`Players without photos: ${countNull.rows[0].count}`);
  } catch (error) {
    console.error("Error checking DB:", error);
  }
}

checkPlayerPhotos();
