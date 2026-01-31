import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function debugCompliance() {
  try {
    // 1. Check league status
    console.log("\n=== LEAGUE STATUS ===");
    const league = await db.execute({
      sql: "SELECT id, status, active_auction_roles FROM auction_leagues WHERE id = 8",
      args: [],
    });
    console.log("League:", league.rows);

    // 2. Check user_sessions
    console.log("\n=== USER SESSIONS ===");
    const sessions = await db.execute({
      sql: "SELECT user_id, session_start, session_end FROM user_sessions ORDER BY session_start DESC LIMIT 10",
      args: [],
    });
    console.log("Sessions:", sessions.rows);

    // 3. Check compliance records
    console.log("\n=== COMPLIANCE STATUS ===");
    const compliance = await db.execute({
      sql: "SELECT * FROM user_league_compliance_status WHERE league_id = 8",
      args: [],
    });
    console.log("Compliance records:", compliance.rows);

    // 4. Check league participants
    console.log("\n=== LEAGUE PARTICIPANTS ===");
    const participants = await db.execute({
      sql: "SELECT user_id, team_name FROM league_participants WHERE league_id = 8",
      args: [],
    });
    console.log("Participants:", participants.rows);

  } catch (error) {
    console.error("Error:", error);
  }
}

debugCompliance();
