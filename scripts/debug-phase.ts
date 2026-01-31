import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function debugPhase() {
  // 1. Get current league status
  const league = await db.execute("SELECT status, active_auction_roles FROM auction_leagues WHERE id = 8");
  const { status, active_auction_roles } = league.rows[0] as { status: string; active_auction_roles: string };

  console.log("=== LEAGUE 8 STATUS ===");
  console.log("Status:", status);
  console.log("Active roles:", active_auction_roles);

  // Calculate expected phase_identifier
  const sortedRoles = active_auction_roles.split(",").map(r => r.trim().toUpperCase()).sort().join(",");
  const expectedPhaseId = `${status}_${sortedRoles}`;
  console.log("\nExpected phase_identifier:", expectedPhaseId);

  // 2. Get all compliance records for league 8
  console.log("\n=== COMPLIANCE RECORDS ===");
  const compliance = await db.execute("SELECT user_id, phase_identifier, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = 8");

  for (const c of compliance.rows) {
    const matches = c.phase_identifier === expectedPhaseId ? "✅ MATCH" : "❌ MISMATCH";
    console.log(`User: ${(c.user_id as string).slice(-8)}... | Phase: ${c.phase_identifier} | Timer: ${c.compliance_timer_start_at} | ${matches}`);
  }

  // 3. Check if there's a record with the current phase
  const currentPhaseRecords = await db.execute({
    sql: "SELECT COUNT(*) as c FROM user_league_compliance_status WHERE league_id = 8 AND phase_identifier = ?",
    args: [expectedPhaseId],
  });
  console.log("\nRecords with current phase_identifier:", (currentPhaseRecords.rows[0] as { c: number }).c);
}

debugPhase().catch(console.error);
