// src/lib/db/services/roster.service.ts
// Servizio dedicato alla gestione della rosa dei giocatori (es. svincoli).

import { db } from "@/lib/db";

/**
 * Svincola un giocatore dalla rosa di un manager durante la fase di riparazione.
 *
 * @param leagueId L'ID della lega.
 * @param playerId L'ID del giocatore da svincolare.
 * @param userId L'ID dell'utente che effettua l'operazione.
 * @returns Un oggetto con un messaggio di successo.
 * @throws Un errore se l'operazione non è permessa.
 */
export const releasePlayerFromRoster = (
  leagueId: number,
  playerId: number,
  userId: string
): { message: string; releasedPlayerName: string; creditsRefunded: number } => {
  const result = db.transaction(() => {
    // 1. Controlla lo stato della lega
    const league = db
      .prepare("SELECT name, status FROM auction_leagues WHERE id = ?")
      .get(leagueId) as { name: string; status: string } | undefined;

    if (!league) {
      throw new Error("Lega non trovata.");
    }
    if (league.status !== "repair_active") {
      throw new Error(
        "Lo svincolo dei giocatori è permesso solo durante la fase 'Asta di Riparazione'."
      );
    }

    // 2. Verifica che il giocatore appartenga all'utente
    const assignment = db
      .prepare(
        "SELECT 1 FROM player_assignments WHERE auction_league_id = ? AND player_id = ? AND user_id = ?"
      )
      .get(leagueId, playerId, userId);

    if (!assignment) {
      throw new Error(
        "Operazione non permessa: questo giocatore non appartiene alla tua rosa."
      );
    }

    // 3. Recupera la quotazione attuale e il nome del giocatore
    const player = db
      .prepare("SELECT name, role, current_quotation FROM players WHERE id = ?")
      .get(playerId) as
      | { name: string; role: string; current_quotation: number }
      | undefined;

    if (!player) {
      throw new Error("Giocatore non trovato nel database.");
    }

    const creditsToRefund = player.current_quotation;

    // 4. Esegui le operazioni di modifica del database
    // a. Rimuovi l'assegnazione del giocatore
    const deleteStmt = db.prepare(
      "DELETE FROM player_assignments WHERE auction_league_id = ? AND player_id = ? AND user_id = ?"
    );
    const deleteResult = deleteStmt.run(leagueId, playerId, userId);

    if (deleteResult.changes === 0) {
      throw new Error("Fallimento nell'eliminazione dell'assegnazione del giocatore.");
    }

    // b. Aggiorna il conteggio slot per il ruolo del giocatore
    const roleColumn = `players_${player.role}_acquired`;
    db.prepare(
      `UPDATE league_participants SET ${roleColumn} = ${roleColumn} - 1 WHERE league_id = ? AND user_id = ?`
    ).run(leagueId, userId);


    // c. Rimborsa i crediti e crea la transazione
    const updateBudgetStmt = db.prepare(
      "UPDATE league_participants SET current_budget = current_budget + ? WHERE league_id = ? AND user_id = ?"
    );
    updateBudgetStmt.run(creditsToRefund, leagueId, userId);

    const newBalance = (
      db
        .prepare(
          "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?"
        )
        .get(leagueId, userId) as { current_budget: number }
    ).current_budget;

    const transactionDescription = `Svincolo di ${player.name}`;
    db.prepare(
      `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, related_player_id, description, balance_after_in_league, transaction_time)
       VALUES (?, ?, 'release', ?, ?, ?, ?, strftime('%s', 'now'))`
    ).run(
      leagueId,
      userId,
      creditsToRefund,
      playerId,
      transactionDescription,
      newBalance
    );

    return {
      message: "Giocatore svincolato con successo!",
      releasedPlayerName: player.name,
      creditsRefunded: creditsToRefund,
    };
  })();

  return result;
};
