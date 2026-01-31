// scripts/list-all-managers.ts
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  const r = await db.execute(
    "SELECT lp.league_id, lp.user_id, lp.manager_team_name, lp.current_budget, lp.locked_credits FROM league_participants lp ORDER BY lp.league_id, lp.manager_team_name"
  );
  console.log("League | Team Name | User ID | Budget | Locked");
  console.log("-".repeat(80));
  for (const row of r.rows as any[]) {
    console.log(
      `${row.league_id} | ${row.manager_team_name} | ${row.user_id} | ${row.current_budget} | ${row.locked_credits}`
    );
  }
}

main().catch(console.error);
