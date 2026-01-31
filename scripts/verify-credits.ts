// scripts/verify-credits.ts
// Script per verificare la coerenza dei crediti di un manager
// Uso: npx tsx scripts/verify-credits.ts <league_id> <user_id>

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

// Carica le variabili d'ambiente
dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function verifyCredits(leagueId: number, userId: string) {
  console.log(`\n============================================================`);
  console.log(`[VERIFICA CREDITI] Lega ${leagueId}, Utente ${userId}`);
  console.log(`============================================================\n`);

  // 1. Dati del partecipante
  const participantResult = await db.execute({
    sql: `SELECT lp.*, al.initial_budget_per_manager
          FROM league_participants lp
          JOIN auction_leagues al ON lp.league_id = al.id
          WHERE lp.league_id = ? AND lp.user_id = ?`,
    args: [leagueId, userId],
  });
  const participant = participantResult.rows[0] as any;

  if (!participant) {
    console.error("[ERRORE] Partecipante non trovato!");
    return;
  }

  console.log("[DATI PARTECIPANTE dal DB]");
  console.log(`   Budget Iniziale: ${participant.initial_budget_per_manager}`);
  console.log(`   Current Budget:  ${participant.current_budget}`);
  console.log(`   Locked Credits:  ${participant.locked_credits}`);
  console.log(`   Team Name:       ${participant.manager_team_name}`);

  // 2. Giocatori assegnati
  const assignedResult = await db.execute({
    sql: `SELECT pa.player_id, p.name, p.role, pa.purchase_price
          FROM player_assignments pa
          JOIN players p ON pa.player_id = p.id
          WHERE pa.auction_league_id = ? AND pa.user_id = ?
          ORDER BY p.role, p.name`,
    args: [leagueId, userId],
  });
  const assignedPlayers = assignedResult.rows as any[];

  console.log(`\n[GIOCATORI ASSEGNATI] (${assignedPlayers.length}):`);
  let totalAssigned = 0;
  for (const p of assignedPlayers) {
    console.log(`   [${p.role}] ${p.name}: ${p.purchase_price}`);
    totalAssigned += p.purchase_price;
  }
  console.log(`   ---------------------------`);
  console.log(`   TOTALE ASSEGNATI: ${totalAssigned}`);

  // 3. Penalita
  const penaltiesResult = await db.execute({
    sql: `SELECT COALESCE(SUM(amount), 0) as total
          FROM budget_transactions
          WHERE auction_league_id = ? AND user_id = ?
          AND transaction_type = 'penalty_requirement'`,
    args: [leagueId, userId],
  });
  const totalPenalties = (penaltiesResult.rows[0] as any)?.total || 0;

  console.log(`\n[PENALITA TOTALI]: ${totalPenalties}`);

  // 4. Auto-bid attivi
  const autoBidsResult = await db.execute({
    sql: `SELECT ab.max_amount, p.name, a.current_highest_bid_amount
          FROM auto_bids ab
          JOIN auctions a ON ab.auction_id = a.id
          JOIN players p ON a.player_id = p.id
          WHERE a.auction_league_id = ? AND ab.user_id = ?
          AND ab.is_active = TRUE AND a.status IN ('active', 'closing')`,
    args: [leagueId, userId],
  });
  const autoBids = autoBidsResult.rows as any[];

  console.log(`\n[AUTO-BID ATTIVI] (${autoBids.length}):`);
  let totalAutoBidMax = 0;
  for (const ab of autoBids) {
    console.log(`   ${ab.name}: max=${ab.max_amount}, offerta_corrente=${ab.current_highest_bid_amount}`);
    totalAutoBidMax += ab.max_amount;
  }
  console.log(`   TOTALE MAX AUTO-BID: ${totalAutoBidMax}`);

  // 5. Offerte vincenti manuali (senza auto-bid)
  const manualBidsResult = await db.execute({
    sql: `SELECT a.current_highest_bid_amount, p.name
          FROM auctions a
          JOIN players p ON a.player_id = p.id
          LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
          WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
          AND ab.id IS NULL AND a.status IN ('active', 'closing')`,
    args: [userId, leagueId, userId],
  });
  const manualBids = manualBidsResult.rows as any[];

  console.log(`\n[OFFERTE VINCENTI MANUALI senza auto-bid] (${manualBids.length}):`);
  let totalManualBids = 0;
  for (const mb of manualBids) {
    console.log(`   ${mb.name}: ${mb.current_highest_bid_amount}`);
    totalManualBids += mb.current_highest_bid_amount;
  }
  console.log(`   TOTALE MANUALI: ${totalManualBids}`);

  // 6. CALCOLI FINALI
  console.log(`\n------------------------------------------------------------`);
  console.log("[RIEPILOGO CALCOLI]");
  console.log(`------------------------------------------------------------`);

  const spesiCalcolato = totalAssigned + totalPenalties;
  const lockedCalcolato = totalAutoBidMax + totalManualBids;

  console.log(`\n[SPESI]:`);
  console.log(`   Giocatori assegnati: ${totalAssigned}`);
  console.log(`   + Penalita:          ${totalPenalties}`);
  console.log(`   -----------------------`);
  console.log(`   = SPESI calcolato:   ${spesiCalcolato}`);

  console.log(`\n[LOCKED CREDITS]:`);
  console.log(`   Auto-bid max:        ${totalAutoBidMax}`);
  console.log(`   + Manuali vincenti:  ${totalManualBids}`);
  console.log(`   -----------------------`);
  console.log(`   = LOCKED calcolato:  ${lockedCalcolato}`);
  console.log(`   Valore nel DB:       ${participant.locked_credits}`);

  if (lockedCalcolato !== participant.locked_credits) {
    console.log(`   [!] DISCREPANZA: ${participant.locked_credits - lockedCalcolato}`);
  } else {
    console.log(`   [OK] CORRETTO!`);
  }

  console.log(`\n[BUDGET]:`);
  console.log(`   Budget iniziale:     ${participant.initial_budget_per_manager}`);
  console.log(`   - SPESI:             ${spesiCalcolato}`);
  console.log(`   -----------------------`);
  console.log(`   = Teorico residuo:   ${participant.initial_budget_per_manager - spesiCalcolato}`);
  console.log(`   Current budget (DB): ${participant.current_budget}`);

  const budgetDiff = participant.current_budget - (participant.initial_budget_per_manager - spesiCalcolato);
  if (budgetDiff !== 0) {
    console.log(`   [!] DIFFERENZA (modifica admin): ${budgetDiff}`);
  }

  console.log(`\n============================================================\n`);
}

// Main
const leagueId = parseInt(process.argv[2] || "1");
const userId = process.argv[3] || "";

if (!userId) {
  console.log("Uso: npx tsx scripts/verify-credits.ts <league_id> <user_id>");
  console.log("Esempio: npx tsx scripts/verify-credits.ts 1 user_2ybRb12u9haFhrS4U7w3d1Yl5zD");
  process.exit(1);
}

verifyCredits(leagueId, userId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
