import { db } from "../index";

export interface DiscardPlayerResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  refundAmount?: number;
  playerName?: string;
}

interface PlayerAssignmentRow {
  user_id: string;
  assignment_price: number;
  player_name: string;
  current_quotation: number;
  role: string;
  team: string;
}

interface UserBudgetRow {
  current_budget: number;
}

interface LeagueCheckRow {
  status: string;
}

export const discardPlayerFromRoster = async (
  leagueId: number,
  playerId: number,
  userId: string
): Promise<DiscardPlayerResult> => {
  try {
    // Start a transaction for atomicity
    const transaction = await db.transaction("write");

    try {
      // 1. Verify league is in repair mode
      const leagueCheckResult = await transaction.execute({
        sql: "SELECT status FROM auction_leagues WHERE id = ?",
        args: [leagueId]
      });

      const leagueCheck: LeagueCheckRow | undefined = leagueCheckResult.rows[0]
        ? {
          status: leagueCheckResult.rows[0].status as string
        }
        : undefined;

      if (!leagueCheck || leagueCheck.status !== "repair_active") {
        await transaction.rollback();
        throw new Error("League is not in repair mode");
      }

      // 2. Verify player ownership and get player details
      const playerAssignmentResult = await transaction.execute({
        sql: `
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
        `,
        args: [leagueId, playerId, userId]
      });

      const playerAssignment: PlayerAssignmentRow | undefined = playerAssignmentResult.rows[0]
        ? {
          user_id: playerAssignmentResult.rows[0].user_id as string,
          assignment_price: playerAssignmentResult.rows[0].assignment_price as number,
          player_name: playerAssignmentResult.rows[0].player_name as string,
          current_quotation: playerAssignmentResult.rows[0].current_quotation as number,
          role: playerAssignmentResult.rows[0].role as string,
          team: playerAssignmentResult.rows[0].team as string,
        }
        : undefined;

      if (!playerAssignment) {
        await transaction.rollback();
        throw new Error(
          "Player not found in your roster or you don't own this player"
        );
      }

      // 3. Get current user budget
      const userBudgetResult = await transaction.execute({
        sql: `
          SELECT current_budget
          FROM league_participants
          WHERE league_id = ? AND user_id = ?
        `,
        args: [leagueId, userId]
      });

      const userBudget: UserBudgetRow | undefined = userBudgetResult.rows[0]
        ? {
          current_budget: userBudgetResult.rows[0].current_budget as number
        }
        : undefined;

      if (!userBudget) {
        await transaction.rollback();
        throw new Error("User not found in league");
      }

      // 4. Calculate refund amount (using current_quotation, not assignment_price)
      const refundAmount = playerAssignment.current_quotation;

      // 5. Remove player from roster (this automatically returns them to available pool)
      const deleteResult = await transaction.execute({
        sql: `
          DELETE FROM player_assignments
          WHERE auction_league_id = ? AND player_id = ? AND user_id = ?
        `,
        args: [leagueId, playerId, userId]
      });

      if (deleteResult.rowsAffected === 0) {
        await transaction.rollback();
        throw new Error("Failed to remove player from roster");
      }

      // 6. Refund credits to user budget
      const updateBudgetResult = await transaction.execute({
        sql: `
          UPDATE league_participants
          SET current_budget = current_budget + ?
          WHERE league_id = ? AND user_id = ?
        `,
        args: [refundAmount, leagueId, userId]
      });

      if (updateBudgetResult.rowsAffected === 0) {
        await transaction.rollback();
        throw new Error("Failed to update user budget");
      }

      // 7. Record the transaction
      const insertTransactionResult = await transaction.execute({
        sql: `
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
        `,
        args: [
          leagueId,
          leagueId,
          userId,
          refundAmount,
          `Rimborso per scarto giocatore: ${playerAssignment.player_name}`,
          playerId,
          userBudget.current_budget + refundAmount
        ]
      });

      if (insertTransactionResult.rowsAffected === 0) {
        await transaction.rollback();
        throw new Error("Failed to record budget transaction");
      }

      // Commit the transaction
      await transaction.commit();

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
        success: true,
        refundAmount,
        playerName: playerAssignment.player_name,
      };
    } catch (error) {
      // Rollback on any error
      await transaction.rollback();
      throw error;
    }
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
