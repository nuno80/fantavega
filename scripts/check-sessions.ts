import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkSessions() {
  console.log("=== USER SESSIONS CHECK ===\n");

  // Get all participants in league 8
  const participants = await db.execute("SELECT user_id, manager_team_name FROM league_participants WHERE league_id = 8");

  for (const p of participants.rows) {
    const sessions = await db.execute({
      sql: "SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ?",
      args: [p.user_id],
    });
    const count = (sessions.rows[0] as { count: number }).count;
    console.log(`${p.manager_team_name} (${p.user_id}): ${count} session(s)`);
  }

  console.log("\n=== TOTAL USER_SESSIONS ===");
  const total = await db.execute("SELECT COUNT(*) as total FROM user_sessions");
  console.log("Total sessions in DB:", total.rows[0]);
}

checkSessions().catch(console.error);
