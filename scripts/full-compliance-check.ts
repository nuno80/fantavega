import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function fullCheck() {
  console.log("=== FULL COMPLIANCE DEBUG ===\n");

  // 1. Check user_sessions
  const sessionsCount = await db.execute("SELECT COUNT(*) as total FROM user_sessions");
  console.log("1. Total user_sessions:", sessionsCount.rows[0]);

  const sessions = await db.execute("SELECT user_id FROM user_sessions LIMIT 5");
  console.log("   Sample users with sessions:", sessions.rows.map(r => r.user_id));

  // 2. Check league status
  const league = await db.execute("SELECT id, status, active_auction_roles, slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = 8");
  console.log("\n2. League 8:", league.rows[0]);

  // 3. Check participants
  const participants = await db.execute("SELECT user_id, manager_team_name, players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired FROM league_participants WHERE league_id = 8");
  console.log("\n3. Participants in league 8:");
  for (const p of participants.rows) {
    const hasSession = await db.execute({
      sql: "SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ?",
      args: [p.user_id],
    });
    console.log(`   - ${p.manager_team_name}: P=${p.players_P_acquired} D=${p.players_D_acquired} C=${p.players_C_acquired} A=${p.players_A_acquired} | hasSession=${(hasSession.rows[0] as { c: number }).c > 0}`);
  }

  // 4. Check compliance records
  const compliance = await db.execute("SELECT user_id, phase_identifier, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = 8");
  console.log("\n4. Compliance status:");
  for (const c of compliance.rows) {
    console.log(`   - ${c.user_id}: phase=${c.phase_identifier} timer=${c.compliance_timer_start_at}`);
  }
}

fullCheck().catch(console.error);
