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
      .prepare(
        "SELECT name, role, current_quotation, current_quotation_mantra FROM players WHERE id = ?"
      )
      .get(playerId) as
      | {
          name: string;
          role: string;
          current_quotation: number;
          current_quotation_mantra: number | null;
        }
      | undefined;

    if (!player) {
      throw new Error("Giocatore non trovato nel database.");
    }

    // Determina il tipo di lega per usare la quotazione corretta
    const leagueType = (
      db
        .prepare("SELECT league_type FROM auction_leagues WHERE id = ?")
        .get(leagueId) as { league_type: string } | undefined
    )?.league_type;

    const creditsToRefund =
      leagueType === "mantra" && player.current_quotation_mantra !== null
        ? player.current_quotation_mantra
        : player.current_quotation;
    console.log(
      `[ROSTER_SERVICE] Player ${player.name} (ID: ${playerId}) current quotation: ${creditsToRefund}`
    );

    // 4. Esegui le operazioni di modifica del database
    // a. Rimuovi l'assegnazione del giocatore
    const deleteStmt = db.prepare(
      "DELETE FROM player_assignments WHERE auction_league_id = ? AND player_id = ? AND user_id = ?"
    );
    const deleteResult = deleteStmt.run(leagueId, playerId, userId);

    if (deleteResult.changes === 0) {
      throw new Error(
        "Fallimento nell'eliminazione dell'assegnazione del giocatore."
      );
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
    console.log(
      `[ROSTER_SERVICE] User ${userId} new budget after refund: ${newBalance}`
    );

    /*
    // =================================================================================
    // [BUGFIX-20251012] Blocco di codice disattivato.
    // Questa logica di ricalcolo dei `locked_credits` è specifica per la fase di
    // draft attivo, ma era erroneamente posizionata in questa funzione che opera
    // solo in fase di `repair_active`, causando valori negativi.
    // Il codice è stato commentato per disattivare il bug e preservarlo come riferimento.
    // =================================================================================
    // d. RICALCOLO COMPLETO CREDITI BLOCCATI (sistema anti-negative credits)
    // Questa logica è rilevante solo durante la fase di draft attivo per correggere eventuali discrepanze.
    if (league.status === 'draft_active') {
      // Invece di decrementare, ricalcoliamo il totale corretto per evitare accumuli di errori
      const userTotalAutoBids = db.prepare(`
        SELECT COALESCE(SUM(ab.max_amount), 0) as total_auto_bid_amount
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        WHERE ab.user_id = ? 
        AND ab.is_active = TRUE 
        AND a.auction_league_id = ?
        AND a.status IN ('active', 'closing')
      `).get(userId, leagueId) as { total_auto_bid_amount: number };
      
      const userManualBids = db.prepare(`
        SELECT COALESCE(SUM(a.current_highest_bid_amount), 0) as total_manual_locked
        FROM auctions a
        WHERE a.current_highest_bidder_id = ?
        AND a.auction_league_id = ?
        AND a.status IN ('active', 'closing')
        AND NOT EXISTS (
          SELECT 1 FROM auto_bids ab 
          WHERE ab.auction_id = a.id 
          AND ab.user_id = a.current_highest_bidder_id 
          AND ab.is_active = TRUE
        )
      `).get(userId, leagueId) as { total_manual_locked: number };
      
      const correctUserLockedCredits = userTotalAutoBids.total_auto_bid_amount + userManualBids.total_manual_locked;
      
      // Imposta il valore corretto (non sottrarre)
      db.prepare(
        "UPDATE league_participants SET locked_credits = ? WHERE league_id = ? AND user_id = ?"
      ).run(correctUserLockedCredits, leagueId, userId);
      
      console.log(
        `[ROSTER_SERVICE] Locked credits per ${userId} ricalcolati a ${correctUserLockedCredits} (auto-bid: ${userTotalAutoBids.total_auto_bid_amount}, manual: ${userManualBids.total_manual_locked})`
      );
    }
    */

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
