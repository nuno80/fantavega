// scripts/list-managers.ts
// Script per listare tutti i manager di una lega
// Uso: npx tsx scripts/list-managers.ts <league_id>

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function listManagers(leagueId: number) {
  console.log(`\n📋 Manager della Lega ${leagueId}:\n`);

  const result = await db.execute({
    sql: `SELECT lp.user_id, lp.manager_team_name, lp.current_budget, lp.locked_credits,
                 u.email, u.username
          FROM league_participants lp
          LEFT JOIN users u ON lp.user_id = u.id
          WHERE lp.league_id = ?
          ORDER BY lp.manager_team_name`,
    args: [leagueId],
  });

  for (const row of result.rows as any[]) {
    console.log(`Team: ${row.manager_team_name}`);
    console.log(`  user_id: ${row.user_id}`);
    console.log(`  email: ${row.email || 'N/A'}`);
    console.log(`  current_budget: ${row.current_budget}`);
    console.log(`  locked_credits: ${row.locked_credits}`);
    console.log('');
  }
}

const leagueId = parseInt(process.argv[2] || "1");

listManagers(leagueId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
