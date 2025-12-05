import { config } from 'dotenv';
config({ path: '.env.local' });

async function updatePlayerPhoto() {
  const { db } = await import("../lib/db");

  console.log("Updating Player Angori Photo...");
  try {
    const photoPath = "/seria_A/pisa/samuele-angori.webp";

    const result = await db.execute({
      sql: "UPDATE players SET photo_url = ? WHERE name = 'Angori'",
      args: [photoPath]
    });

    console.log(`Updated rows: ${result.rowsAffected}`);

    // Verify
    const players = await db.execute({
      sql: "SELECT * FROM players WHERE name = 'Angori'",
      args: []
    });
    console.log("Updated Record:", players.rows[0]);

  } catch (error) {
    console.error("Error updating player:", error);
  }
}

updatePlayerPhoto();
