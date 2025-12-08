// Script temporaneo per verificare lo stato dei crediti nel database
// Eseguire con: pnpm exec tsx src/lib/db/check-credits.ts

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

// Carica variabili d'ambiente
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function checkCredits() {
  console.log("\n========================================");
  console.log("🔍 VERIFICA CREDITI - Fantavega Database");
  console.log("========================================\n");

  // 1. Verifica locked_credits negativi attuali
  console.log("1️⃣ Controllo locked_credits negativi attuali...");
  const negativeLockedResult = await client.execute({
    sql: `
      SELECT lp.user_id, u.email, lp.league_id, lp.current_budget, lp.locked_credits
      FROM league_participants lp
      LEFT JOIN users u ON lp.user_id = u.id
      WHERE lp.locked_credits < 0
    `,
    args: [],
  });

  if (negativeLockedResult.rows.length === 0) {
    console.log("   ✅ Nessun locked_credits negativo trovato!\n");
  } else {
    console.log(
      `   ❌ ATTENZIONE: Trovati ${negativeLockedResult.rows.length} record con locked_credits negativi:`
    );
    console.table(negativeLockedResult.rows);
  }

  // 2. Verifica current_budget negativi
  console.log("\n2️⃣ Controllo current_budget negativi...");
  const negativeBudgetResult = await client.execute({
    sql: `
      SELECT lp.user_id, u.email, lp.league_id, lp.current_budget, lp.locked_credits
      FROM league_participants lp
      LEFT JOIN users u ON lp.user_id = u.id
      WHERE lp.current_budget < 0
    `,
    args: [],
  });

  if (negativeBudgetResult.rows.length === 0) {
    console.log("   ✅ Nessun current_budget negativo trovato!\n");
  } else {
    console.log(
      `   ❌ ATTENZIONE: Trovati ${negativeBudgetResult.rows.length} record con current_budget negativi:`
    );
    console.table(negativeBudgetResult.rows);
  }

  // 3. Riepilogo stato attuale partecipanti
  console.log("\n3️⃣ Stato attuale partecipanti (tutte le leghe)...");
  const allParticipantsResult = await client.execute({
    sql: `
      SELECT
        lp.league_id,
        al.name as league_name,
        lp.user_id,
        u.email,
        lp.current_budget,
        lp.locked_credits,
        (lp.current_budget - lp.locked_credits) as available
      FROM league_participants lp
      LEFT JOIN users u ON lp.user_id = u.id
      LEFT JOIN auction_leagues al ON lp.league_id = al.id
      ORDER BY lp.league_id, lp.user_id
    `,
    args: [],
  });
  console.table(allParticipantsResult.rows);

  // 4. Verifica auto-bid attivi vs locked_credits
  console.log("\n4️⃣ Confronto auto-bid attivi vs locked_credits...");
  const autoBidComparisonResult = await client.execute({
    sql: `
      SELECT
        ab.user_id,
        u.email,
        a.auction_league_id as league_id,
        SUM(ab.max_amount) as total_auto_bid_amount,
        lp.locked_credits,
        (SUM(ab.max_amount) - lp.locked_credits) as difference
      FROM auto_bids ab
      JOIN auctions a ON ab.auction_id = a.id
      LEFT JOIN users u ON ab.user_id = u.id
      LEFT JOIN league_participants lp ON lp.user_id = ab.user_id AND lp.league_id = a.auction_league_id
      WHERE ab.is_active = TRUE AND a.status IN ('active', 'closing')
      GROUP BY ab.user_id, a.auction_league_id
      HAVING difference != 0
    `,
    args: [],
  });

  if (autoBidComparisonResult.rows.length === 0) {
    console.log(
      "   ✅ Tutti gli auto-bid attivi sono correttamente sincronizzati con locked_credits!\n"
    );
  } else {
    console.log(
      `   ⚠️ Trovate ${autoBidComparisonResult.rows.length} discrepanze tra auto-bid e locked_credits:`
    );
    console.table(autoBidComparisonResult.rows);
  }

  // 5. Storico transazioni con importi negativi (escluse penalità)
  console.log("\n5️⃣ Controllo transazioni con importi negativi sospetti...");
  const negativeTransactionsResult = await client.execute({
    sql: `
      SELECT
        bt.id,
        bt.user_id,
        u.email,
        bt.amount,
        bt.transaction_type,
        bt.description,
        datetime(bt.created_at, 'unixepoch') as created_at
      FROM budget_transactions bt
      LEFT JOIN users u ON bt.user_id = u.id
      WHERE bt.amount < 0
        AND bt.transaction_type NOT IN ('win_auction_debit', 'penalty_requirement')
      ORDER BY bt.created_at DESC
      LIMIT 20
    `,
    args: [],
  });

  if (negativeTransactionsResult.rows.length === 0) {
    console.log("   ✅ Nessuna transazione negativa sospetta trovata!\n");
  } else {
    console.log(
      `   ⚠️ Trovate ${negativeTransactionsResult.rows.length} transazioni negative (non penalità/acquisti):`
    );
    console.table(negativeTransactionsResult.rows);
  }

  // 6. Controlla penalità applicate
  console.log("\n6️⃣ Riepilogo penalità applicate per utente...");
  const penaltiesResult = await client.execute({
    sql: `
      SELECT
        bt.user_id,
        u.email,
        bt.auction_league_id as league_id,
        COUNT(*) as penalty_count,
        SUM(ABS(bt.amount)) as total_penalty_amount
      FROM budget_transactions bt
      LEFT JOIN users u ON bt.user_id = u.id
      WHERE bt.transaction_type = 'penalty_requirement'
      GROUP BY bt.user_id, bt.auction_league_id
    `,
    args: [],
  });

  if (penaltiesResult.rows.length === 0) {
    console.log("   ℹ️ Nessuna penalità applicata.\n");
  } else {
    console.table(penaltiesResult.rows);
  }

  console.log("\n========================================");
  console.log("✅ VERIFICA COMPLETATA");
  console.log("========================================\n");
}

checkCredits()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Errore durante la verifica:", err);
    process.exit(1);
  });
