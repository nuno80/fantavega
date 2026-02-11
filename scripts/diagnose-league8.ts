// scripts/diagnose-league8.ts
// Script diagnostico per analizzare lo stato aste Malen/Raspadori in lega 8
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function diagnose() {
  console.log("=== DIAGNOSI LEGA 8 - MALEN & RASPADORI ===\n");

  // 1. Trova i giocatori
  const players = await db.execute({
    sql: "SELECT id, name, role, team FROM players WHERE LOWER(name) LIKE '%malen%' OR LOWER(name) LIKE '%raspadori%'",
    args: [],
  });
  console.log("--- GIOCATORI ---");
  console.table(players.rows);

  // 2. Aste per questi giocatori nella lega 8
  const playerIds = players.rows.map((r) => r.id);
  for (const pid of playerIds) {
    console.log(`\n--- ASTE PER PLAYER ID ${pid} (${players.rows.find(r => r.id === pid)?.name}) ---`);
    const auctions = await db.execute({
      sql: `SELECT a.id, a.status, a.current_highest_bid_amount, a.current_highest_bidder_id,
                   datetime(a.start_time, 'unixepoch', '+1 hour') as start_cet,
                   datetime(a.scheduled_end_time, 'unixepoch', '+1 hour') as end_cet,
                   datetime(a.updated_at, 'unixepoch', '+1 hour') as updated_cet,
                   u.username as highest_bidder
            FROM auctions a
            LEFT JOIN users u ON a.current_highest_bidder_id = u.id
            WHERE a.auction_league_id = 8 AND a.player_id = ?
            ORDER BY a.updated_at DESC`,
      args: [pid],
    });
    console.table(auctions.rows);

    // 3. Offerte per queste aste
    for (const auction of auctions.rows) {
      console.log(`\n  --- OFFERTE ASTA ID ${auction.id} ---`);
      const bids = await db.execute({
        sql: `SELECT b.id, b.user_id, u.username, b.amount, b.bid_type,
                     datetime(b.bid_time, 'unixepoch', '+1 hour') as bid_time_cet
              FROM bids b
              JOIN users u ON b.user_id = u.id
              WHERE b.auction_id = ?
              ORDER BY b.bid_time ASC`,
        args: [auction.id],
      });
      console.table(bids.rows);

      // 4. Auto-bids per questa asta
      console.log(`\n  --- AUTO-BIDS ASTA ID ${auction.id} ---`);
      const autoBids = await db.execute({
        sql: `SELECT ab.user_id, u.username, ab.max_amount, ab.is_active,
                     datetime(ab.created_at, 'unixepoch', '+1 hour') as created_cet,
                     datetime(ab.updated_at, 'unixepoch', '+1 hour') as updated_cet
              FROM auto_bids ab
              JOIN users u ON ab.user_id = u.id
              WHERE ab.auction_id = ?`,
        args: [auction.id],
      });
      console.table(autoBids.rows);

      // 5. Response timers per questa asta
      console.log(`\n  --- RESPONSE TIMERS ASTA ID ${auction.id} ---`);
      const timers = await db.execute({
        sql: `SELECT urt.id, urt.user_id, u.username, urt.status,
                     datetime(urt.created_at, 'unixepoch', '+1 hour') as created_cet,
                     datetime(urt.response_deadline, 'unixepoch', '+1 hour') as deadline_cet,
                     datetime(urt.activated_at, 'unixepoch', '+1 hour') as activated_cet,
                     datetime(urt.processed_at, 'unixepoch', '+1 hour') as processed_cet
              FROM user_auction_response_timers urt
              JOIN users u ON urt.user_id = u.id
              WHERE urt.auction_id = ?`,
        args: [auction.id],
      });
      console.table(timers.rows);
    }
  }

  // 6. Cooldowns nella lega 8
  console.log(`\n--- COOLDOWNS LEGA 8 ---`);
  const cooldowns = await db.execute({
    sql: `SELECT upp.user_id, u.username, upp.player_id, p.name as player_name,
                 upp.preference_type,
                 datetime(upp.expires_at, 'unixepoch', '+1 hour') as expires_cet
          FROM user_player_preferences upp
          JOIN users u ON upp.user_id = u.id
          JOIN players p ON upp.player_id = p.id
          WHERE upp.league_id = 8`,
    args: [],
  });
  console.table(cooldowns.rows);

  // 7. Compliance status lega 8
  console.log(`\n--- COMPLIANCE STATUS LEGA 8 ---`);
  const compliance = await db.execute({
    sql: `SELECT ulcs.user_id, u.username, ulcs.phase_identifier,
                 datetime(ulcs.compliance_timer_start_at, 'unixepoch', '+1 hour') as timer_start_cet,
                 ulcs.penalties_applied_this_cycle,
                 datetime(ulcs.updated_at, 'unixepoch', '+1 hour') as updated_cet
          FROM user_league_compliance_status ulcs
          JOIN users u ON ulcs.user_id = u.id
          WHERE ulcs.league_id = 8`,
    args: [],
  });
  console.table(compliance.rows);

  // 8. Sessioni utente (login/logout) per i partecipanti della lega 8
  console.log(`\n--- SESSIONI UTENTE (ULTIMI LOGIN/LOGOUT) LEGA 8 ---`);
  const sessions = await db.execute({
    sql: `SELECT us.user_id, u.username,
                 datetime(us.session_start, 'unixepoch', '+1 hour') as login_cet,
                 datetime(us.session_end, 'unixepoch', '+1 hour') as logout_cet,
                 CASE WHEN us.session_end IS NULL THEN 'ONLINE' ELSE 'OFFLINE' END as status
          FROM user_sessions us
          JOIN users u ON us.user_id = u.id
          WHERE us.user_id IN (SELECT user_id FROM league_participants WHERE league_id = 8)
          ORDER BY us.session_start DESC
          LIMIT 30`,
    args: [],
  });
  console.table(sessions.rows);

  // 9. Player assignments nella lega 8 per Malen/Raspadori
  console.log(`\n--- PLAYER ASSIGNMENTS LEGA 8 (MALEN/RASPADORI) ---`);
  for (const pid of playerIds) {
    const assignments = await db.execute({
      sql: `SELECT pa.user_id, u.username, pa.player_id, p.name,
                   pa.purchase_price,
                   datetime(pa.assigned_at, 'unixepoch', '+1 hour') as assigned_cet
            FROM player_assignments pa
            JOIN users u ON pa.user_id = u.id
            JOIN players p ON pa.player_id = p.id
            WHERE pa.auction_league_id = 8 AND pa.player_id = ?`,
      args: [pid],
    });
    console.table(assignments.rows);
  }

  // 10. Budget transazioni recenti lega 8
  console.log(`\n--- TRANSAZIONI BUDGET RECENTI LEGA 8 ---`);
  const transactions = await db.execute({
    sql: `SELECT bt.user_id, u.username, bt.transaction_type, bt.amount, bt.description,
                 datetime(bt.transaction_time, 'unixepoch', '+1 hour') as time_cet
          FROM budget_transactions bt
          JOIN users u ON bt.user_id = u.id
          WHERE bt.auction_league_id = 8
          ORDER BY bt.transaction_time DESC
          LIMIT 30`,
    args: [],
  });
  console.table(transactions.rows);

  // 11. Partecipanti lega 8 - budget e stato
  console.log(`\n--- PARTECIPANTI LEGA 8 ---`);
  const participants = await db.execute({
    sql: `SELECT lp.user_id, u.username, lp.current_budget, lp.locked_credits,
                 lp.players_P_acquired, lp.players_D_acquired,
                 lp.players_C_acquired, lp.players_A_acquired
          FROM league_participants lp
          JOIN users u ON lp.user_id = u.id
          WHERE lp.league_id = 8`,
    args: [],
  });
  console.table(participants.rows);

  console.log("\n=== FINE DIAGNOSI ===");
}

diagnose()
  .catch((e) => console.error("ERRORE:", e))
  .finally(() => process.exit(0));
