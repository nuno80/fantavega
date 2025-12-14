import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!process.env.TURSO_DATABASE_URL) {
  dotenv.config({ path: ".env" });
}

async function run() {
  // Dynamic imports to ensure env vars are loaded first
  const { processUserComplianceAndPenalties } = await import("@/lib/db/services/penalty.service");

  const leagueId = 6;
  // Users identified from debug output
  const users = [
    { id: 'user_36pgTn3e1HtCOqQ4AsrfBh6oHHE', name: 'armando' }
  ];

  for (const user of users) {
    console.log(`\nProcessing compliance for ${user.name} (${user.id})...`);
    try {
      const result = await processUserComplianceAndPenalties(leagueId, user.id);
      console.log("Result:", result);
    } catch (error) {
      console.error(`Error processing ${user.name}:`, error);
    }
  }
}

run().catch(console.error);
