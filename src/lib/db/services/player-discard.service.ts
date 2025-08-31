import { db } from "../index";

export interface DiscardPlayerResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  refundAmount?: number;
  playerName?: string;
}

export const discardPlayerFromRoster = async (
  leagueId: number,
  playerId: number,
  userId: string
): Promise<DiscardPlayerResult> => {
  try {
    // Start a transaction for atomicity
    const transaction = db.transaction(() => {
      // 1. Verify league is in repair mode
      const leagueCheck = db
        .prepare("SELECT status FROM auction_leagues WHERE id = ?")
        .get(leagueId) as { status: string } | undefined;

      if (!leagueCheck || leagueCheck.status !== "repair_active") {
        throw new Error("League is not in repair mode");
      }

      // 2. Verify player ownership and get player details
      const playerAssignment = db
        .prepare(
          `
          SELECT 
            pa.user_id,
            pa.purchase_price as assignment_price,
            p.name as player_name,
            p.current_quotation,
            p.role,
            p.team
          FROM player_assignments pa
          JOIN players p ON pa.player_id = p.id
          WHERE pa.auction_league_id = ? AND pa.player_id = ? AND pa.user_id = ?
        `
        )
        .get(leagueId, playerId, userId) as
        | {
            user_id: string;
            assignment_price: number;
            player_name: string;
            current_quotation: number;
            role: string;
            team: string;
          }
        | undefined;

      if (!playerAssignment) {
        throw new Error(
          "Player not found in your roster or you don't own this player"
        );
      }

      // 3. Get current user budget
      const userBudget = db
        .prepare(
          `
          SELECT current_budget
          FROM league_participants
          WHERE league_id = ? AND user_id = ?
        `
        )
        .get(leagueId, userId) as { current_budget: number } | undefined;

      if (!userBudget) {
        throw new Error("User not found in league");
      }

      // 4. Calculate refund amount (using current_quotation, not assignment_price)
      const refundAmount = playerAssignment.current_quotation;

      // 5. Remove player from roster (this automatically returns them to available pool)
      const deleteResult = db
        .prepare(
          `
          DELETE FROM player_assignments
          WHERE auction_league_id = ? AND player_id = ? AND user_id = ?
        `
        )
        .run(leagueId, playerId, userId);

      if (deleteResult.changes === 0) {
        throw new Error("Failed to remove player from roster");
      }

      // 6. Refund credits to user budget
      const updateBudgetResult = db
        .prepare(
          `
          UPDATE league_participants
          SET current_budget = current_budget + ?
          WHERE league_id = ? AND user_id = ?
        `
        )
        .run(refundAmount, leagueId, userId);

      if (updateBudgetResult.changes === 0) {
        throw new Error("Failed to update user budget");
      }

      // 7. Record the transaction
      const insertTransactionResult = db
        .prepare(
          `
          INSERT INTO budget_transactions (
            auction_league_id,
            league_id,
            user_id,
            transaction_type,
            amount,
            description,
            related_player_id,
            balance_after_in_league
          ) VALUES (?, ?, ?, 'discard_player_credit', ?, ?, ?, ?)
        `
        )
        .run(
          leagueId,
          leagueId,
          userId,
          refundAmount,
          `Rimborso per scarto giocatore: ${playerAssignment.player_name}`,
          playerId,
          userBudget.current_budget + refundAmount
        );

      if (insertTransactionResult.changes === 0) {
        throw new Error("Failed to record budget transaction");
      }

      console.log("[PLAYER_DISCARD] Successfully discarded player:", {
        leagueId,
        playerId,
        userId,
        playerName: playerAssignment.player_name,
        refundAmount,
        previousBudget: userBudget.current_budget,
        newBudget: userBudget.current_budget + refundAmount,
      });

      return {
        refundAmount,
        playerName: playerAssignment.player_name,
      };
    });

    const result = transaction();

    return {
      success: true,
      refundAmount: result.refundAmount,
      playerName: result.playerName,
    };
  } catch (error) {
    console.error("[PLAYER_DISCARD] Error:", error);

    if (error instanceof Error) {
      // Handle specific error types
      if (error.message.includes("not in repair mode")) {
        return {
          success: false,
          error: "League is not in repair mode",
          statusCode: 400,
        };
      }
      if (error.message.includes("not found in your roster")) {
        return {
          success: false,
          error: "Player not found in your roster",
          statusCode: 404,
        };
      }
      if (error.message.includes("don't own this player")) {
        return {
          success: false,
          error: "You don't own this player",
          statusCode: 403,
        };
      }

      return {
        success: false,
        error: error.message,
        statusCode: 500,
      };
    }

    return {
      success: false,
      error: "An unknown error occurred",
      statusCode: 500,
    };
  }
};
