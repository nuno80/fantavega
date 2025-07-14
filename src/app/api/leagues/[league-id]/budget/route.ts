// src/app/api/leagues/[league-id]/budget/route.ts
// API endpoint to get user's budget information for a specific league

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { authorizeLeagueAccess } from "@/lib/auth/authorization";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);
    
    // Use centralized authorization check to prevent IDOR
    const authResult = await authorizeLeagueAccess(leagueId);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    
    const user = authResult.user;

    // Get user's budget information for this league
    // Authorization already verified above, so this should always return data
    const budgetInfo = db
      .prepare(
        `SELECT 
          lp.current_budget,
          lp.locked_credits,
          lp.manager_team_name as team_name,
          al.initial_budget_per_manager as total_budget
         FROM league_participants lp
         JOIN auction_leagues al ON lp.league_id = al.id
         WHERE lp.league_id = ? AND lp.user_id = ?`
      )
      .get(leagueId, user.id);

    if (!budgetInfo) {
      // This should not happen due to authorization check above
      console.error(`Budget info not found for user ${user.id} in league ${leagueId} despite authorization check`);
      return NextResponse.json(
        { error: "Errore interno: dati budget non trovati" },
        { status: 500 }
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