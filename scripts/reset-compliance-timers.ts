import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function resetComplianceTimers() {
  try {
    // First, check current state
    const before = await db.execute({
      sql: "SELECT user_id, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = 8",
      args: [],
    });
    console.log("Before:", before.rows);

    // Reset the timers
    const result = await db.execute({
      sql: "UPDATE user_league_compliance_status SET compliance_timer_start_at = NULL WHERE league_id = 8",
      args: [],
    });
    console.log("Rows affected:", result.rowsAffected);

    // Check after
    const after = await db.execute({
      sql: "SELECT user_id, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = 8",
      args: [],
    });
    console.log("After:", after.rows);

    console.log("✅ Compliance timers reset successfully!");
  } catch (error) {
    console.error("Error:", error);
  }
}

resetComplianceTimers();
