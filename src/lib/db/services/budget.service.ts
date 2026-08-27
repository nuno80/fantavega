// src/lib/db/services/budget.service.ts v.2.0 (Async Turso Migration)
// Servizio per la logica di business relativa alla gestione del budget e delle transazioni.
// 1. Importazioni
import { db } from "@/lib/db";

// 2. Tipi e Interfacce Esportate
export interface BudgetTransactionView {
  id: number;
  transaction_type: string; // 'initial_allocation', 'win_auction_debit', etc.
  amount: number; // L'importo della transazione (es. costo dell'asta, budget allocato)
  description: string | null;
  balance_after_in_league: number; // Saldo del partecipante DOPO questa transazione
  transaction_time: number; // Timestamp Unix
  related_auction_id: number | null;
  related_player_id: number | null;
  player_name: string | null; // Nome del giocatore, se la transazione è legata a un giocatore
}

// Interfaccia per filtri futuri (non usata attivamente in questa v.1.0)
export interface BudgetTransactionFilters {
  page?: number;
  limit?: number;
  sortBy?: string; // es. 'transaction_time'
  sortOrder?: "asc" | "desc";
  transactionType?: string;
}

// 3. Adjust budget + record ledger entry in one atomic transaction
export interface AdjustBudgetResult {
  success: boolean;
  message: string;
  newBudget?: number;
}

export async function adjustBudgetAtomically(
  leagueId: number,
  userId: string,
  amount: number,
  description: string,
): Promise<AdjustBudgetResult> {
  const tx = await db.transaction("write");
  try {
    // Conditional update: reject if result would be negative
    const updateResult = await tx.execute({
      sql: `UPDATE league_participants
            SET current_budget = current_budget + ?
            WHERE league_id = ? AND user_id = ? AND current_budget + ? >= 0`,
      args: [amount, leagueId, userId, amount],
    });

    if (updateResult.rowsAffected === 0) {
      // Distinguish "not found" from "would go negative"
      const exists = await tx.execute({
        sql: `SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?`,
        args: [leagueId, userId],
      });
      await tx.rollback();
      if (exists.rows.length === 0) {
        return { success: false, message: "Partecipante non trovato nella lega." };
      }
      return { success: false, message: "Il budget non può diventare negativo." };
    }

    // Read the post-update balance inside the same transaction
    const balanceResult = await tx.execute({
      sql: `SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?`,
      args: [leagueId, userId],
    });
    const newBudget = balanceResult.rows[0].current_budget as number;

    const transactionType = amount > 0 ? "admin_budget_increase" : "admin_budget_decrease";
    await tx.execute({
      sql: `INSERT INTO budget_transactions
            (auction_league_id, user_id, transaction_type, amount, description, balance_after_in_league)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [leagueId, userId, transactionType, amount, description, newBudget],
    });

    await tx.commit();
    return { success: true, message: `Budget aggiornato: ${amount > 0 ? "+" : ""}${amount} crediti.`, newBudget };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// 4. Funzione per Recuperare la Cronologia delle Transazioni di Budget
/**
 * Recupera la cronologia delle transazioni di budget per un utente specifico in una lega.
 * @param leagueId L'ID della lega.
 * @param userId L'ID dell'utente (manager).
 * @param _filters Filtri opzionali per la query (non implementati in v.1.0).
 * @returns Una Promise che risolve in un array di BudgetTransactionView.
 */
export const getBudgetTransactionHistory = async (
  leagueId: number,
  userId: string,
  _filters?: BudgetTransactionFilters // Parametro per estensibilità futura, non usato ora
): Promise<BudgetTransactionView[]> => {
  console.log(
    `[SERVICE BUDGET] Getting budget transaction history for user ${userId} in league ${leagueId}`
  );

  try {
    // Query per selezionare le transazioni, facendo un LEFT JOIN con players per ottenere il nome del giocatore
    // se la transazione è relativa a un'asta per un giocatore.
    const result = await db.execute({
      sql: `
      SELECT
        bt.id,
        bt.transaction_type,
        bt.amount,
        bt.description,
        bt.balance_after_in_league,
        bt.transaction_time,
        bt.related_auction_id,
        bt.related_player_id,
        p.name AS player_name
      FROM budget_transactions bt
      LEFT JOIN players p ON bt.related_player_id = p.id
      WHERE bt.auction_league_id = ? AND bt.user_id = ?
      ORDER BY bt.transaction_time DESC -- Le transazioni più recenti prima
    `,
      args: [leagueId, userId],
    });

    const transactions = result.rows as unknown as BudgetTransactionView[];

    console.log(
      `[SERVICE BUDGET] Found ${transactions.length} transactions for user ${userId} in league ${leagueId}.`
    );
    return transactions;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error retrieving budget history.";
    console.error(
      `[SERVICE BUDGET] Error getting budget transaction history for user ${userId}, league ${leagueId}: ${errorMessage}`,
      error
    );
    throw new Error(
      `Failed to retrieve budget transaction history: ${errorMessage}`
    );
  }
};
