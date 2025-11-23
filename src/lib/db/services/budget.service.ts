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

// 3. Funzione per Recuperare la Cronologia delle Transazioni di Budget
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
