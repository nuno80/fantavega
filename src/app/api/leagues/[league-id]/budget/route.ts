// src/app/api/leagues/[league-id]/budget/route.ts
// API endpoint to get user's budget information for a specific league
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);

    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Get user's budget information for this league
    const budgetInfoResult = await db.execute({
      sql: `SELECT
          lp.current_budget,
          lp.locked_credits,
          lp.manager_team_name as team_name,
          al.initial_budget_per_manager as total_budget
         FROM league_participants lp
         JOIN auction_leagues al ON lp.league_id = al.id
         WHERE lp.league_id = ? AND lp.user_id = ?`,
      args: [leagueId, user.id],
    });
    const budgetInfo = budgetInfoResult.rows[0];

    if (!budgetInfo) {
      return NextResponse.json(
        { error: "Utente non partecipa a questa lega" },
        { status: 404 }
      );
    }

    return NextResponse.json(budgetInfo);
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json(
      { error: "Errore nel recupero del budget" },
      { status: 500 }
    );
  }
}
