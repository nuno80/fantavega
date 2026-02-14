import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  // 1. Partecipanti lega 9
  const team = await db.execute({
    sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = 9",
    args: [],
  });
  console.log("=== PARTECIPANTI LEGA 9 ===");
  team.rows.forEach((r) => console.log(r.user_id, "|", r.manager_team_name));

  // 2. Trova Lukaku
  const lukaku = await db.execute({
    sql: "SELECT id, name, team FROM players WHERE LOWER(name) LIKE '%lukaku%'",
    args: [],
  });
  console.log("\n=== LUKAKU ===");
  lukaku.rows.forEach((r) => console.log("ID:", r.id, "Name:", r.name, "Team:", r.team));

  if (lukaku.rows.length === 0) {
    console.log("Lukaku non trovato!");
    return;
  }

  const lukakuId = lukaku.rows[0].id as number;

  // 3. Asta attiva per Lukaku in lega 9
  const auction = await db.execute({
    sql: "SELECT id, status, current_highest_bid_amount, current_highest_bidder_id, scheduled_end_time FROM auctions WHERE player_id = ? AND auction_league_id = 9",
    args: [lukakuId],
  });
  console.log("\n=== ASTA LUKAKU LEGA 9 ===");
  auction.rows.forEach((r) => console.log(r));

  if (auction.rows.length === 0) {
    console.log("Nessuna asta trovata!");
    return;
  }

  const auctionId = auction.rows[0].id as number;

  // 4. Timer di risposta per questa asta
  const timers = await db.execute({
    sql: "SELECT * FROM user_auction_response_timers WHERE auction_id = ?",
    args: [auctionId],
  });
  console.log("\n=== TIMER RISPOSTA ===");
  timers.rows.forEach((r) => console.log(r));

  // 5. Cooldown per Lukaku in lega 9
  const cooldowns = await db.execute({
    sql: "SELECT * FROM user_player_preferences WHERE player_id = ? AND league_id = 9 AND preference_type = 'cooldown'",
    args: [lukakuId],
  });
  console.log("\n=== COOLDOWN LUKAKU ===");
  cooldowns.rows.forEach((r) => {
    const expiresAt = r.expires_at as number;
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - now;
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    console.log(r);
    console.log(`  Expires in: ${hours}h ${mins}m (${remaining > 0 ? 'ATTIVO' : 'SCADUTO'})`);
  });

  // 6. Offerte per questa asta
  const bids = await db.execute({
    sql: "SELECT b.user_id, b.amount, b.bid_type, b.bid_time, lp.manager_team_name FROM bids b JOIN league_participants lp ON b.user_id = lp.user_id AND lp.league_id = 9 WHERE b.auction_id = ? ORDER BY b.bid_time DESC LIMIT 10",
    args: [auctionId],
  });
  console.log("\n=== ULTIME 10 OFFERTE ===");
  bids.rows.forEach((r) => console.log(r));

  // 7. Sessioni dell'utente Cadrega
  const cadregaUser = team.rows.find(r => (r.manager_team_name as string)?.includes("Cadrega"));
  if (cadregaUser) {
    const sessions = await db.execute({
      sql: "SELECT * FROM user_sessions WHERE user_id = ? ORDER BY session_start DESC LIMIT 5",
      args: [cadregaUser.user_id],
    });
    console.log("\n=== SESSIONI CADREGA ===");
    sessions.rows.forEach((r) => console.log(r));
  }
}

main().catch(console.error);
