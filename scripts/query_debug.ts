import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
if (!process.env.TURSO_DATABASE_URL) {
  dotenv.config({ path: ".env" });
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function run() {
  try {
    console.log("--- 1. Inspect League and User ---");
    const participants = await db.execute(`
      SELECT l.id as league_id, l.name as league_name, u.id as user_id, u.username, lp.manager_team_name, lp.current_budget, l.status, l.active_auction_roles
      FROM auction_leagues l
      JOIN league_participants lp ON l.id = lp.league_id
      JOIN users u ON lp.user_id = u.id
      WHERE l.name LIKE '%Test%' AND (u.username LIKE '%Armando%' OR lp.manager_team_name LIKE '%Armando%');
    `);
    console.table(participants.rows);

    if (participants.rows.length === 0) {
      console.log("No matching participant found.");
      return;
    }

    const { league_id, user_id } = participants.rows[0];

    console.log("--- 2b. Compliance Status (ALL Matching Users) ---");
    const allCompliance = await db.execute({
      sql: `
        SELECT ulcs.league_id, ulcs.user_id, u.username, ulcs.compliance_timer_start_at, ulcs.penalties_applied_this_cycle
        FROM user_league_compliance_status ulcs
        JOIN users u ON ulcs.user_id = u.id
        WHERE ulcs.league_id = ?
      `,
      args: [league_id]
    });
    console.table(allCompliance.rows);

    console.log("\n--- 4. Session Check ---");
    const sessions = await db.execute({
      sql: "SELECT * FROM user_sessions WHERE user_id = ? LIMIT 1",
      args: [user_id]
    });
    console.table(sessions.rows);

    // Insert missing session for fragrande if not exists
    if (sessions.rows.length === 0) {
      console.log("\n--- Fixing: Inserting missing session for user ---");
      await db.execute({
        sql: "INSERT INTO user_sessions (user_id, session_start) VALUES (?, ?)",
        args: [user_id, Math.floor(Date.now() / 1000)]
      });
      console.log("Session inserted.");
    }

    console.log("\n--- 5. Global Session Check ---");
    const allSessions = await db.execute("SELECT count(*) as count FROM user_sessions");
    console.table(allSessions.rows);

    console.log("\n--- 6. Other User Check ---");
    // Check the other 'Armando' user
    const otherUser = participants.rows.length > 1 ? participants.rows[1] : null;
    if (otherUser) {
      const otherUserId = otherUser.user_id;
      console.log(`Checking other user: ${otherUserId}`);
      const otherSessions = await db.execute({
        sql: "SELECT * FROM user_sessions WHERE user_id = ? LIMIT 1",
        args: [otherUserId]
      });
      console.table(otherSessions.rows);
    }

  } catch (e) {
    console.error(e);
  } finally {
    db.close();
  }
}

run();
