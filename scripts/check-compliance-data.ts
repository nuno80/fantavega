import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function check() {
  try {
    // 1. Check if user_sessions table has any data at all
    const count = await db.execute({
      sql: "SELECT COUNT(*) as total FROM user_sessions",
      args: [],
    });
    console.log("user_sessions count:", count.rows[0]);

    // 2. Check league status
    const league = await db.execute({
      sql: "SELECT id, status, active_auction_roles FROM auction_leagues WHERE id = 8",
      args: [],
    });
    console.log("League 8:", league.rows[0]);

    // 3. Check compliance status for league 8
    const compliance = await db.execute({
      sql: "SELECT league_id, user_id, phase_identifier, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = 8",
      args: [],
    });
    console.log("Compliance for league 8:", compliance.rows);

  } catch (error) {
    console.error("Error:", error);
  }
}

check();
