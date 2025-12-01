import { db } from "@/lib/db";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Debug endpoint to verify budget consistency
 * Only accessible by admin users
 */
export async function GET(request: Request) {
  try {
    const user = await currentUser();

    // Check if user is admin
    if (!user || user.publicMetadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized - Admin only" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get("leagueId") || "2";

    // Query 1: Current budget status
    const participantsResult = await db.execute({
      sql: `
        SELECT
          lp.user_id,
          lp.manager_team_name,
          lp.current_budget as disponibili,
          lp.locked_credits as bloccati,
          al.initial_budget_per_manager as iniziale,
          (al.initial_budget_per_manager - (lp.current_budget + lp.locked_credits)) as spesi_calcolati
        FROM league_participants lp
        JOIN auction_leagues al ON lp.league_id = al.id
        WHERE lp.league_id = ?
        ORDER BY lp.user_id
      `,
      args: [leagueId],
    });

    // Query 2: Budget transactions
    const transactionsResult = await db.execute({
      sql: `
        SELECT
          user_id,
          transaction_type,
          amount,
          description,
          created_at,
          balance_after_in_league
        FROM budget_transactions
        WHERE league_id = ?
        ORDER BY user_id, created_at DESC
        LIMIT 100
      `,
      args: [leagueId],
    });

    // Query 3: Player assignments (spent credits)
    const assignmentsResult = await db.execute({
      sql: `
        SELECT
          pa.user_id,
          COUNT(*) as num_players,
          SUM(pa.purchase_price) as total_spent
        FROM player_assignments pa
        WHERE pa.auction_league_id = ?
        GROUP BY pa.user_id
      `,
      args: [leagueId],
    });

    // Query 4: Active auctions (locked credits)
    const activeAuctionsResult = await db.execute({
      sql: `
        SELECT
          a.current_highest_bidder_id as user_id,
          COUNT(*) as active_auctions,
          SUM(a.current_highest_bid_amount) as locked_amount
        FROM auctions a
        WHERE a.auction_league_id = ?
          AND a.status = 'active'
        GROUP BY a.current_highest_bidder_id
      `,
      args: [leagueId],
    });

    // Query 5: Penalties
    const penaltiesResult = await db.execute({
      sql: `
        SELECT
          user_id,
          COUNT(*) as num_penalties,
          SUM(ABS(amount)) as total_penalties
        FROM budget_transactions
        WHERE auction_league_id = ?
          AND transaction_type = 'penalty_requirement'
        GROUP BY user_id
      `,
      args: [leagueId],
    });

    return NextResponse.json({
      status: "success",
      leagueId,
      data: {
        participants: participantsResult.rows,
        transactions: transactionsResult.rows,
        assignments: assignmentsResult.rows,
        activeAuctions: activeAuctionsResult.rows,
        penalties: penaltiesResult.rows,
      },
    });
  } catch (error) {
    console.error("[DEBUG] Budget verification error:", error);
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
