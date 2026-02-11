
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function refundBuggedPenalties() {
  const now = Math.floor(Date.now() / 1000);
  console.log("Inizio rimborso penalità buggate per leghe 8 e 9...");

  try {
    // 1. Trova tutte le transazioni di penalità 'penalty_requirement' per le leghe 8 e 9
    // Raggruppa per utente e calcola il totale da rimborsare
    const resPenalties = await db.execute({
      sql: `
        SELECT user_id, auction_league_id as league_id, SUM(ABS(amount)) as total_refund, COUNT(*) as penalty_count
        FROM budget_transactions
        WHERE transaction_type = 'penalty_requirement'
          AND auction_league_id IN (8, 9)
        GROUP BY user_id, auction_league_id
      `,
      args: [],
    });

    const refunds = resPenalties.rows as unknown as {
      user_id: string;
      league_id: number;
      total_refund: number;
      penalty_count: number;
    }[];

    console.log(`Trovati ${refunds.length} utenti da rimborsare.`);

    for (const refund of refunds) {
      console.log(`Rimborsando utente ${refund.user_id} (Lega ${refund.league_id}): ${refund.total_refund} crediti (${refund.penalty_count} penalità).`);

      const tx = await db.transaction("write");
      try {
        // A. Aggiorna il budget corrente
        await tx.execute({
          sql: "UPDATE league_participants SET current_budget = current_budget + ? WHERE league_id = ? AND user_id = ?",
          args: [refund.total_refund, refund.league_id, refund.user_id],
        });

        // B. Inserisci transazione di rimborso
        const newBalanceRes = await tx.execute({
          sql: "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?",
          args: [refund.league_id, refund.user_id]
        });
        const newBalance = Number(newBalanceRes.rows[0].current_budget);

        await tx.execute({
          sql: `
            INSERT INTO budget_transactions
            (auction_league_id, user_id, transaction_type, amount, description, balance_after_in_league, created_at, transaction_time)
            VALUES (?, ?, 'admin_budget_increase', ?, ?, ?, ?, ?)
          `,
          args: [
            refund.league_id,
            refund.user_id,
            refund.total_refund,
            `Rimborso automatico per ${refund.penalty_count} penalità annullate (Bug Timer)`,
            newBalance,
            now,
            now
          ],
        });

        // C. Resetta i contatori di penalità in 'user_league_compliance_status'
        // Così l'utente riparte da zero penalità nel ciclo corrente e non rischia il limite massimo
        await tx.execute({
          sql: `
                UPDATE user_league_compliance_status
                SET penalties_applied_this_cycle = 0,
                    last_penalty_applied_for_hour_ending_at = NULL,
                    updated_at = ?
                WHERE league_id = ? AND user_id = ?
            `,
          args: [now, refund.league_id, refund.user_id]
        });

        await tx.commit();
        console.log(`-> Rimborso completato per ${refund.user_id}.`);

      } catch (txError) {
        await tx.rollback();
        console.error(`Errore transazione rimborso per ${refund.user_id}:`, txError);
      }
    }

    // D. Opzionale: Cancellazione fisica delle transazioni di penalità errate?
    // Meglio NON cancellarle per audit trail, ma marcare il rimborso come fatto sopra.
    // Oppure potremmo volerle "annotare" come rimborsate se aggiungessimo una colonna, ma 'penalty_refund' controbilancia.

    console.log("Procedura di rimborso completata.");

  } catch (e) {
    console.error("Errore generale durante il rimborso:", e);
  }
}

refundBuggedPenalties();
