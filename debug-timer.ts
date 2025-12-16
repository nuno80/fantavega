// Script per analizzare i dati del DB Turso
// Eseguire con: npx tsx debug-timer.ts

import { createClient } from "@libsql/client";
import "dotenv/config";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  console.log("=== ANALISI TIMER BUG ===\n");

  // 1. Trova l'utente Fede
  console.log("1. UTENTI:");
  const users = await db.execute(`
    SELECT u.id, u.full_name, lp.manager_team_name
    FROM users u
    JOIN league_participants lp ON u.id = lp.user_id
    WHERE lp.league_id = 6
  `);
  console.table(users.rows);

  // 2. Trova player Contini
  console.log("\n2. PLAYER CONTINI:");
  const contini = await db.execute(`
    SELECT id, name FROM players WHERE name LIKE '%Contini%'
  `);
  console.table(contini.rows);

  // 3. Sessioni utente per Fede (team con Fede nel nome)
  console.log("\n3. SESSIONI ATTIVE ULTIMI 2 GIORNI:");
  const sessions = await db.execute(`
    SELECT user_id, session_start, session_end,
           datetime(session_start, 'unixepoch') as start_readable,
           datetime(session_end, 'unixepoch') as end_readable
    FROM user_sessions
    ORDER BY session_start DESC
    LIMIT 20
  `);
  console.table(sessions.rows);

  // 4. Timer di risposta per le aste attive
  console.log("\n4. TIMER DI RISPOSTA ATTIVI/PENDING:");
  const timers = await db.execute(`
    SELECT t.id, t.auction_id, t.user_id, t.status,
           t.response_deadline, t.created_at, t.activated_at,
           datetime(t.response_deadline, 'unixepoch') as deadline_readable,
           datetime(t.created_at, 'unixepoch') as created_readable,
           datetime(t.activated_at, 'unixepoch') as activated_readable,
           a.player_id, p.name as player_name
    FROM user_auction_response_timers t
    JOIN auctions a ON t.auction_id = a.id
    JOIN players p ON a.player_id = p.id
    WHERE t.status IN ('pending', 'active')
    ORDER BY t.created_at DESC
    LIMIT 20
  `);
  console.table(timers.rows);

  // 5. Aste attive
  console.log("\n5. ASTE ATTIVE:");
  const auctions = await db.execute(`
    SELECT a.id, a.player_id, p.name as player_name, a.current_highest_bidder_id, a.status
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.status = 'active'
    ORDER BY a.id DESC
    LIMIT 10
  `);
  console.table(auctions.rows);

  console.log("\n=== FINE ANALISI ===");
}

main().catch(console.error);
