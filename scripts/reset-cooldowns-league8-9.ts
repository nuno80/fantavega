
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function resetCooldowns() {
  console.log("Inizio reset cooldown per leghe 8 e 9...");

  try {
    // 1. Reset Cooldown (user_player_preferences)
    // Cancella le preferenze di tipo 'cooldown' per le leghe specificate
    const resCooldown = await db.execute({
      sql: "DELETE FROM user_player_preferences WHERE preference_type = 'cooldown' AND league_id IN (8, 9)",
      args: [],
    });
    console.log(`Cooldown rimossi: ${resCooldown.rowsAffected} (da user_player_preferences)`);

    // 2. Opzionale: Reset eventuali Response Timers 'abandoned' o 'expired' a 'cancelled'
    // Questo è solo per pulizia, ma il cooldown vero è in user_player_preferences
    const resTimers = await db.execute({
      sql: "UPDATE user_auction_response_timers SET status = 'cancelled' WHERE status IN ('abandoned', 'expired') AND auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (8, 9))",
      args: []
    });
    console.log(`Storico timer 'abandoned'/'expired' marcati come 'cancelled': ${resTimers.rowsAffected}`);

  } catch (e) {
    console.error("Errore durante il reset dei cooldown:", e);
  }
}

resetCooldowns();
