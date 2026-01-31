// scripts/fix-locked-credits.ts
// Script per ricalcolare i locked_credits per tutti i partecipanti
// Uso: npx tsx scripts/fix-locked-credits.ts [league_id]
// Se non si specifica league_id, corregge tutte le leghe

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function fixLockedCredits(leagueId?: number) {
  console.log(`\n============================================================`);
  console.log(`[FIX LOCKED CREDITS] ${leagueId ? `Lega ${leagueId}` : "Tutte le leghe"}`);
  console.log(`============================================================\n`);

  // Ottieni tutti i partecipanti (opzionalmente filtrati per lega)
  const participantsQuery = leagueId
    ? {
      sql: "SELECT league_id, user_id, locked_credits, manager_team_name FROM league_participants WHERE league_id = ?",
      args: [leagueId],
    }
    : {
      sql: "SELECT league_id, user_id, locked_credits, manager_team_name FROM league_participants",
      args: [],
    };

  const participantsResult = await db.execute(participantsQuery);
  const participants = participantsResult.rows as any[];

  console.log(`Trovati ${participants.length} partecipanti da verificare\n`);

  let fixedCount = 0;
  let alreadyCorrectCount = 0;

  for (const p of participants) {
    // Calcola i locked_credits corretti
    const calcResult = await db.execute({
      sql: `
        SELECT
          COALESCE(
            (SELECT SUM(ab.max_amount)
             FROM auto_bids ab
             JOIN auctions a ON ab.auction_id = a.id
             WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
            0
          ) +
          COALESCE(
            (SELECT SUM(a.current_highest_bid_amount)
             FROM auctions a
             LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
             WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
               AND ab.id IS NULL
               AND a.status IN ('active', 'closing')),
            0
          ) as calculated_locked
      `,
      args: [p.league_id, p.user_id, p.user_id, p.league_id, p.user_id],
    });

    const calculatedLocked = (calcResult.rows[0] as any)?.calculated_locked || 0;
    const currentLocked = p.locked_credits || 0;

    if (calculatedLocked !== currentLocked) {
      console.log(`[FIX] ${p.manager_team_name || p.user_id} (Lega ${p.league_id})`);
      console.log(`      DB: ${currentLocked} -> Corretto: ${calculatedLocked} (diff: ${calculatedLocked - currentLocked})`);

      // Aggiorna il valore
      await db.execute({
        sql: "UPDATE league_participants SET locked_credits = ? WHERE league_id = ? AND user_id = ?",
        args: [calculatedLocked, p.league_id, p.user_id],
      });

      fixedCount++;
    } else {
      alreadyCorrectCount++;
    }
  }

  console.log(`\n------------------------------------------------------------`);
  console.log(`[RIEPILOGO]`);
  console.log(`   Corretti:          ${fixedCount}`);
  console.log(`   Gia corretti:      ${alreadyCorrectCount}`);
  console.log(`   Totale verificati: ${participants.length}`);
  console.log(`============================================================\n`);
}

// Main
const leagueId = process.argv[2] ? parseInt(process.argv[2]) : undefined;

fixLockedCredits(leagueId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Errore:", err);
    process.exit(1);
  });
