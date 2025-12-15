// Script per analizzare i crediti della lega 'Test Fantavega'
// Eseguire con: pnpm exec tsx scripts/analyze-credits.ts

import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function analyzeCredits() {
  console.log("\n" + "=".repeat(80));
  console.log("📊 ANALISI COMPLETA CREDITI - Lega 'Test Fantavega'");
  console.log("=".repeat(80) + "\n");

  // 1. Trova la lega 'Test Fantavega'
  console.log("1️⃣ INFORMAZIONI LEGA\n");
  const leagueResult = await db.execute({
    sql: `SELECT * FROM auction_leagues WHERE name LIKE '%Test Fantavega%'`,
    args: [],
  });

  if (leagueResult.rows.length === 0) {
    console.log("❌ Lega 'Test Fantavega' non trovata!");
    return;
  }

  const league = leagueResult.rows[0];
  console.log(`   ID: ${league.id}`);
  console.log(`   Nome: ${league.name}`);
  console.log(`   Status: ${league.status}`);
  console.log(`   Budget Iniziale: ${league.initial_budget_per_manager}`);
  console.log(`   Active Auction Roles: ${league.active_auction_roles}`);

  const leagueId = league.id;
  const initialBudget = Number(league.initial_budget_per_manager);

  // 2. Stato attuale partecipanti
  console.log("\n" + "-".repeat(80));
  console.log("2️⃣ STATO PARTECIPANTI (current_budget, locked_credits)\n");

  const participantsResult = await db.execute({
    sql: `
      SELECT
        lp.user_id,
        u.username,
        u.email,
        lp.manager_team_name,
        lp.current_budget,
        lp.locked_credits,
        (lp.current_budget - lp.locked_credits) as available
      FROM league_participants lp
      LEFT JOIN users u ON lp.user_id = u.id
      WHERE lp.league_id = ?
      ORDER BY lp.manager_team_name
    `,
    args: [leagueId],
  });

  console.table(participantsResult.rows);

  // 3. Auto-bid attivi
  console.log("\n" + "-".repeat(80));
  console.log("3️⃣ AUTO-BID ATTIVI\n");

  const autoBidsResult = await db.execute({
    sql: `
      SELECT
        ab.id,
        ab.user_id,
        u.username,
        lp.manager_team_name,
        p.name as player_name,
        ab.max_amount,
        ab.is_active,
        a.status as auction_status,
        a.current_highest_bid_amount,
        datetime(ab.created_at, 'unixepoch') as created_at
      FROM auto_bids ab
      JOIN auctions a ON ab.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      LEFT JOIN users u ON ab.user_id = u.id
      LEFT JOIN league_participants lp ON lp.user_id = ab.user_id AND lp.league_id = a.auction_league_id
      WHERE a.auction_league_id = ?
      ORDER BY ab.is_active DESC, ab.created_at DESC
    `,
    args: [leagueId],
  });

  console.table(autoBidsResult.rows);

  // 4. Calcolo locked_credits atteso vs reale
  console.log("\n" + "-".repeat(80));
  console.log("4️⃣ VERIFICA LOCKED_CREDITS (Atteso vs Reale)\n");

  const expectedLockedResult = await db.execute({
    sql: `
      SELECT
        ab.user_id,
        lp.manager_team_name,
        SUM(ab.max_amount) as expected_locked,
        lp.locked_credits as actual_locked,
        (SUM(ab.max_amount) - lp.locked_credits) as difference
      FROM auto_bids ab
      JOIN auctions a ON ab.auction_id = a.id
      JOIN league_participants lp ON lp.user_id = ab.user_id AND lp.league_id = a.auction_league_id
      WHERE ab.is_active = TRUE
        AND a.status IN ('active', 'closing')
        AND a.auction_league_id = ?
      GROUP BY ab.user_id, lp.manager_team_name, lp.locked_credits
    `,
    args: [leagueId],
  });

  if (expectedLockedResult.rows.length === 0) {
    console.log("   ℹ️ Nessun auto-bid attivo per aste attive.\n");
  } else {
    console.table(expectedLockedResult.rows);

    const discrepancies = expectedLockedResult.rows.filter((r: any) => r.difference !== 0);
    if (discrepancies.length > 0) {
      console.log("\n   ⚠️ DISCREPANZE TROVATE:");
      discrepancies.forEach((d: any) => {
        console.log(`      - ${d.manager_team_name}: Atteso ${d.expected_locked}, Reale ${d.actual_locked} (diff: ${d.difference})`);
      });
    } else {
      console.log("   ✅ Nessuna discrepanza nei locked_credits!\n");
    }
  }

  // 5. Giocatori assegnati (spesi)
  console.log("\n" + "-".repeat(80));
  console.log("5️⃣ GIOCATORI ASSEGNATI (CREDITI SPESI)\n");

  const assignedPlayersResult = await db.execute({
    sql: `
      SELECT
        pa.user_id,
        lp.manager_team_name,
        p.name as player_name,
        p.role,
        pa.purchase_price,
        datetime(pa.assigned_at, 'unixepoch') as assigned_at
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      LEFT JOIN league_participants lp ON lp.user_id = pa.user_id AND lp.league_id = pa.auction_league_id
      WHERE pa.auction_league_id = ?
      ORDER BY lp.manager_team_name, pa.assigned_at
    `,
    args: [leagueId],
  });

  console.table(assignedPlayersResult.rows);

  // Riepilogo speso per manager
  const spentByManagerResult = await db.execute({
    sql: `
      SELECT
        pa.user_id,
        lp.manager_team_name,
        COUNT(*) as players_count,
        SUM(pa.purchase_price) as total_spent
      FROM player_assignments pa
      LEFT JOIN league_participants lp ON lp.user_id = pa.user_id AND lp.league_id = pa.auction_league_id
      WHERE pa.auction_league_id = ?
      GROUP BY pa.user_id, lp.manager_team_name
    `,
    args: [leagueId],
  });

  console.log("\n   📊 Riepilogo speso per manager:");
  console.table(spentByManagerResult.rows);

  // 6. Tutte le transazioni budget
  console.log("\n" + "-".repeat(80));
  console.log("6️⃣ TUTTE LE TRANSAZIONI BUDGET\n");

  const transactionsResult = await db.execute({
    sql: `
      SELECT
        bt.id,
        bt.user_id,
        lp.manager_team_name,
        bt.amount,
        bt.transaction_type,
        bt.description,
        datetime(bt.created_at, 'unixepoch') as created_at
      FROM budget_transactions bt
      LEFT JOIN league_participants lp ON lp.user_id = bt.user_id AND lp.league_id = bt.auction_league_id
      WHERE bt.auction_league_id = ?
      ORDER BY bt.created_at DESC
    `,
    args: [leagueId],
  });

  console.table(transactionsResult.rows);

  // Riepilogo transazioni per tipo
  const transactionsByTypeResult = await db.execute({
    sql: `
      SELECT
        bt.transaction_type,
        COUNT(*) as count,
        SUM(bt.amount) as total_amount
      FROM budget_transactions bt
      WHERE bt.auction_league_id = ?
      GROUP BY bt.transaction_type
    `,
    args: [leagueId],
  });

  console.log("\n   📊 Riepilogo transazioni per tipo:");
  console.table(transactionsByTypeResult.rows);

  // 7. Penalità
  console.log("\n" + "-".repeat(80));
  console.log("7️⃣ PENALITÀ APPLICATE\n");

  const penaltiesResult = await db.execute({
    sql: `
      SELECT
        bt.user_id,
        lp.manager_team_name,
        COUNT(*) as penalty_count,
        SUM(ABS(bt.amount)) as total_penalty,
        bt.description
      FROM budget_transactions bt
      LEFT JOIN league_participants lp ON lp.user_id = bt.user_id AND lp.league_id = bt.auction_league_id
      WHERE bt.auction_league_id = ? AND bt.transaction_type = 'penalty_requirement'
      GROUP BY bt.user_id, lp.manager_team_name, bt.description
    `,
    args: [leagueId],
  });

  if (penaltiesResult.rows.length === 0) {
    console.log("   ℹ️ Nessuna penalità applicata.\n");
  } else {
    console.table(penaltiesResult.rows);
  }

  // 8. Stato compliance
  console.log("\n" + "-".repeat(80));
  console.log("8️⃣ STATO COMPLIANCE\n");

  const complianceResult = await db.execute({
    sql: `
      SELECT
        ulcs.user_id,
        lp.manager_team_name,
        ulcs.compliance_timer_start_at,
        datetime(ulcs.compliance_timer_start_at, 'unixepoch') as timer_started_at,
        ulcs.penalties_applied_this_cycle,
        ulcs.last_penalty_applied_for_hour_ending_at
      FROM user_league_compliance_status ulcs
      LEFT JOIN league_participants lp ON lp.user_id = ulcs.user_id AND lp.league_id = ulcs.league_id
      WHERE ulcs.league_id = ?
    `,
    args: [leagueId],
  });

  if (complianceResult.rows.length === 0) {
    console.log("   ℹ️ Nessun record di compliance trovato.\n");
  } else {
    console.table(complianceResult.rows);
  }

  // 9. Aste attive
  console.log("\n" + "-".repeat(80));
  console.log("9️⃣ ASTE ATTIVE/CLOSING\n");

  const activeAuctionsResult = await db.execute({
    sql: `
      SELECT
        a.id,
        p.name as player_name,
        p.role,
        a.status,
        a.current_highest_bid_amount,
        a.current_highest_bidder_id,
        lp.manager_team_name as highest_bidder,
        datetime(a.scheduled_end_time, 'unixepoch') as ends_at
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      LEFT JOIN league_participants lp ON lp.user_id = a.current_highest_bidder_id AND lp.league_id = a.auction_league_id
      WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing')
      ORDER BY a.scheduled_end_time
    `,
    args: [leagueId],
  });

  if (activeAuctionsResult.rows.length === 0) {
    console.log("   ℹ️ Nessuna asta attiva.\n");
  } else {
    console.table(activeAuctionsResult.rows);
  }

  // 10. VERIFICA FORMULA BUDGET
  console.log("\n" + "=".repeat(80));
  console.log("🧮 VERIFICA FORMULA BUDGET");
  console.log("=".repeat(80));
  console.log("\n   Formula attesa: current_budget = INIZIALE - SPESO_GIOCATORI - PENALITÀ");
  console.log("   (dove SPESO = somma purchase_price di player_assignments)\n");

  for (const participant of participantsResult.rows) {
    const userId = participant.user_id;
    const teamName = participant.manager_team_name || participant.username;
    const currentBudget = Number(participant.current_budget);
    const lockedCredits = Number(participant.locked_credits);

    // Calcola speso (giocatori assegnati)
    const spentResult = await db.execute({
      sql: `
        SELECT COALESCE(SUM(purchase_price), 0) as total_spent
        FROM player_assignments
        WHERE user_id = ? AND auction_league_id = ?
      `,
      args: [userId, leagueId],
    });
    const totalSpent = Number(spentResult.rows[0].total_spent);

    // Calcola penalità
    const penaltyResult = await db.execute({
      sql: `
        SELECT COALESCE(SUM(ABS(amount)), 0) as total_penalty
        FROM budget_transactions
        WHERE user_id = ? AND auction_league_id = ? AND transaction_type = 'penalty_requirement'
      `,
      args: [userId, leagueId],
    });
    const totalPenalty = Number(penaltyResult.rows[0].total_penalty);

    // Calcola atteso
    const expectedBudget = initialBudget - totalSpent - totalPenalty;
    const difference = currentBudget - expectedBudget;

    console.log(`   📋 ${teamName}:`);
    console.log(`      • Budget Iniziale: ${initialBudget}`);
    console.log(`      • Speso (giocatori): ${totalSpent}`);
    console.log(`      • Penalità: ${totalPenalty}`);
    console.log(`      • Budget Atteso: ${expectedBudget}`);
    console.log(`      • Budget Reale (current_budget): ${currentBudget}`);
    console.log(`      • Locked Credits: ${lockedCredits}`);
    console.log(`      • Differenza: ${difference !== 0 ? '⚠️ ' + difference : '✅ 0'}`);
    console.log("");
  }

  // 11. Storico offerte (bids)
  console.log("\n" + "-".repeat(80));
  console.log("🔟 STORICO OFFERTE (ultime 30)\n");

  const bidsResult = await db.execute({
    sql: `
      SELECT
        b.id,
        p.name as player_name,
        b.user_id,
        lp.manager_team_name,
        b.amount,
        b.bid_type,
        a.status as auction_status,
        datetime(b.created_at, 'unixepoch') as created_at
      FROM bids b
      JOIN auctions a ON b.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      LEFT JOIN league_participants lp ON lp.user_id = b.user_id AND lp.league_id = a.auction_league_id
      WHERE a.auction_league_id = ?
      ORDER BY b.created_at DESC
      LIMIT 30
    `,
    args: [leagueId],
  });

  console.table(bidsResult.rows);

  console.log("\n" + "=".repeat(80));
  console.log("✅ ANALISI COMPLETATA");
  console.log("=".repeat(80) + "\n");
}

analyzeCredits()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Errore durante l'analisi:", err);
    db.close();
    process.exit(1);
  });
