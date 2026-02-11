
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function diagnose() {
  console.log("=== DIAGNOSTICA TIMERS (Lega 8 & 9) ===");
  const now = Math.floor(Date.now() / 1000);

  const res = await db.execute({
    sql: `
      SELECT
        a.id,
        a.auction_league_id,
        p.name,
        datetime(a.scheduled_end_time, 'unixepoch', '+1 hour') as end_cet,
        (a.scheduled_end_time - ?) / 3600.0 as hours_remaining
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      WHERE a.auction_league_id IN (8, 9)
        AND a.status = 'active'
      ORDER BY hours_remaining DESC
      LIMIT 20
    `,
    args: [now],
  });
  console.table(res.rows);

  const countExcessive = await db.execute({
    sql: `SELECT COUNT(*) as count FROM auctions WHERE auction_league_id IN (8, 9) AND status = 'active' AND (scheduled_end_time - ?) > 86400`,
    args: [now]
  });
  console.log(`\nTOTALE ASTE > 24h: ${countExcessive.rows[0].count}`);

  console.log("\n=== FINE DIAGNOSI ===");
}

diagnose();
