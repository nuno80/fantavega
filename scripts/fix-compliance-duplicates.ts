// Script per diagnosticare e pulire duplicati in user_league_compliance_status
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

// Carica le variabili d'ambiente
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkAndCleanDuplicates() {
  console.log("=== Checking for duplicate compliance records ===");

  // 1. Trova record duplicati
  const duplicatesResult = await db.execute({
    sql: `
      SELECT league_id, user_id, phase_identifier, COUNT(*) as count
      FROM user_league_compliance_status
      GROUP BY league_id, user_id, phase_identifier
      HAVING COUNT(*) > 1
    `,
    args: [],
  });

  console.log(`Found ${duplicatesResult.rows.length} duplicate groups:`);
  console.log(JSON.stringify(duplicatesResult.rows, null, 2));

  // 2. Mostra tutti i record per utente/lega problematici
  const allRecordsResult = await db.execute({
    sql: `
      SELECT * FROM user_league_compliance_status
      WHERE league_id = 8 AND user_id = 'user_36pmU3lg5WQ0ye2btbennJzGOHX'
      ORDER BY updated_at DESC
    `,
    args: [],
  });

  console.log(`\n=== Records for problematic user ===`);
  console.log(JSON.stringify(allRecordsResult.rows, null, 2));

  // 3. Pulisci duplicati mantenendo solo il più recente
  if (duplicatesResult.rows.length > 0) {
    console.log("\n=== Cleaning duplicates... ===");

    // Per ogni gruppo di duplicati, elimina tutti tranne il più recente
    await db.execute({
      sql: `
        DELETE FROM user_league_compliance_status
        WHERE rowid NOT IN (
          SELECT MAX(rowid)
          FROM user_league_compliance_status
          GROUP BY league_id, user_id, phase_identifier
        )
      `,
      args: [],
    });

    console.log("Duplicates cleaned!");

    // Verifica
    const afterCleanResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM user_league_compliance_status WHERE league_id = 8`,
      args: [],
    });
    console.log(`Records remaining for league 8: ${afterCleanResult.rows[0].count}`);
  }
}

checkAndCleanDuplicates()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
