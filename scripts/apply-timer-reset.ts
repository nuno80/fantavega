
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function applyReset() {
  const now = Math.floor(Date.now() / 1000);
  const newEnd = now + 86400; // 24 ore esatte
  const responseDeadline = now + 3600; // 1 ora per i response timer

  console.log(`Applicazione reset: Fine asta = ${newEnd}, Deadline risposta = ${responseDeadline} (Now = ${now})`);

  try {
    const resAuctions = await db.execute({
      sql: "UPDATE auctions SET scheduled_end_time = ? WHERE auction_league_id IN (8, 9) AND status = 'active'",
      args: [newEnd]
    });
    console.log(`Aste aggiornate: ${resAuctions.rowsAffected}`);

    const resTimers = await db.execute({
      sql: "UPDATE user_auction_response_timers SET response_deadline = ? WHERE status = 'pending' AND auction_id IN (SELECT id FROM auctions WHERE auction_league_id IN (8, 9) AND status = 'active')",
      args: [responseDeadline]
    });
    console.log(`Timer di risposta aggiornati: ${resTimers.rowsAffected}`);

  } catch (e) {
    console.error("Errore durante l'applicazione:", e);
  }
}

applyReset();
