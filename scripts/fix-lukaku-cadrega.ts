import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const CADREGA_USER_ID = "user_39KwDnGH5tT1qwQELtCq57kYZ7z";
const LUKAKU_PLAYER_ID = 2531;
const AUCTION_ID = 235;
const LEAGUE_ID = 9;

async function main() {
  console.log("=== FIX: Rimuovere cooldown e timer expired per Cadrega su Lukaku ===\n");

  // 1. Rimuovere il cooldown
  const cooldownResult = await db.execute({
    sql: "DELETE FROM user_player_preferences WHERE user_id = ? AND player_id = ? AND league_id = ? AND preference_type = 'cooldown'",
    args: [CADREGA_USER_ID, LUKAKU_PLAYER_ID, LEAGUE_ID],
  });
  console.log(`1. Cooldown rimosso: ${cooldownResult.rowsAffected} righe eliminate`);

  // 2. Rimuovere il timer expired (id 238)
  const timerResult = await db.execute({
    sql: "DELETE FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ? AND status = 'expired'",
    args: [AUCTION_ID, CADREGA_USER_ID],
  });
  console.log(`2. Timer expired rimosso: ${timerResult.rowsAffected} righe eliminate`);

  // 3. Rimuovere anche eventuali budget_transactions di tipo timer_expired per questa asta
  const txResult = await db.execute({
    sql: "SELECT id, description, transaction_type FROM budget_transactions WHERE user_id = ? AND auction_league_id = ? AND transaction_type IN ('timer_expired', 'auction_abandoned') AND description LIKE '%Lukaku%'",
    args: [CADREGA_USER_ID, LEAGUE_ID],
  });
  console.log(`\n3. Transazioni correlate trovate: ${txResult.rows.length}`);
  txResult.rows.forEach((r) => console.log(`   - ID ${r.id}: [${r.transaction_type}] ${r.description}`));

  // 4. Verifica finale
  console.log("\n=== VERIFICA FINALE ===");

  const cooldownCheck = await db.execute({
    sql: "SELECT * FROM user_player_preferences WHERE user_id = ? AND player_id = ? AND league_id = ? AND preference_type = 'cooldown'",
    args: [CADREGA_USER_ID, LUKAKU_PLAYER_ID, LEAGUE_ID],
  });
  console.log(`Cooldown rimasti: ${cooldownCheck.rows.length} (deve essere 0)`);

  const timerCheck = await db.execute({
    sql: "SELECT id, status FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ?",
    args: [AUCTION_ID, CADREGA_USER_ID],
  });
  console.log(`Timer rimasti: ${timerCheck.rows.length} (deve essere 0)`);
  timerCheck.rows.forEach((r) => console.log(`   - Timer ID ${r.id}: status = ${r.status}`));

  console.log("\n✅ Fix applicato! Cadrega può ora rilanciare su Lukaku.");
}

main().catch(console.error);
