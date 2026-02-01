// Script per analizzare i record compliance in dettaglio
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function analyzeComplianceTimer() {
  const now = Math.floor(Date.now() / 1000);
  console.log(`=== Current timestamp: ${now} ===`);
  console.log(`=== Current date: ${new Date(now * 1000).toISOString()} ===\n`);

  const result = await db.execute({
    sql: `SELECT * FROM user_league_compliance_status WHERE league_id = 8`,
    args: [],
  });

  for (const row of result.rows) {
    const record = row as any;
    console.log(`--- User: ${record.user_id} ---`);
    console.log(`Phase: ${record.phase_identifier}`);
    console.log(`compliance_timer_start_at: ${record.compliance_timer_start_at}`);
    console.log(`  → Date: ${record.compliance_timer_start_at ? new Date(record.compliance_timer_start_at * 1000).toISOString() : 'NULL'}`);
    console.log(`  → Grace ends at: ${record.compliance_timer_start_at ? new Date((record.compliance_timer_start_at + 3600) * 1000).toISOString() : 'NULL'}`);
    console.log(`  → Grace period expired: ${record.compliance_timer_start_at ? (record.compliance_timer_start_at + 3600 <= now) : 'N/A'}`);

    console.log(`last_penalty_applied_for_hour_ending_at: ${record.last_penalty_applied_for_hour_ending_at}`);
    console.log(`  → Date: ${record.last_penalty_applied_for_hour_ending_at ? new Date(record.last_penalty_applied_for_hour_ending_at * 1000).toISOString() : 'NULL'}`);
    console.log(`  → Next penalty due at: ${record.last_penalty_applied_for_hour_ending_at ? new Date((record.last_penalty_applied_for_hour_ending_at + 3600) * 1000).toISOString() : 'NULL'}`);
    console.log(`  → Next penalty due: ${record.last_penalty_applied_for_hour_ending_at ? (record.last_penalty_applied_for_hour_ending_at + 3600 <= now) : 'first penalty'}`);

    console.log(`penalties_applied_this_cycle: ${record.penalties_applied_this_cycle}`);
    console.log(`updated_at: ${new Date(record.updated_at * 1000).toISOString()}`);
    console.log('');
  }
}

analyzeComplianceTimer()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
