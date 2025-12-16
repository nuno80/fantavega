// src/app/api/user/leagues/route.ts
// API endpoint to get leagues for the current user
// NOTE: This endpoint does NOT call recordUserLogin because it's used by the home page.
// Session tracking should only happen on auction/players specific endpoints.
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// Type per le righe restituite dalla query
interface UserLeagueRow {
  id: number;
  name: string;
  status: string;
  min_bid: number;
  team_name: string;
  current_budget: number;
  locked_credits: number;
}

export async function GET(_request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // NOTE: recordUserLogin is NOT called here intentionally.
    // This allows the inactivity redirect to properly close the session
    // without it being immediately reopened when user lands on home page.

    // Get leagues where the user is a participant
    const userLeaguesResult = await db.execute({
      sql: `SELECT
          al.id,
          al.name,
          al.status,
          al.min_bid,
          lp.manager_team_name as team_name,
          lp.current_budget,
          lp.locked_credits
         FROM auction_leagues al
         JOIN league_participants lp ON al.id = lp.league_id
         WHERE lp.user_id = ?
         ORDER BY al.created_at DESC`,
      args: [user.id]
    });

    // Conversione sicura da Row[] a UserLeagueRow[]
    const userLeagues: UserLeagueRow[] = userLeaguesResult.rows.map(row => ({
      id: row.id as number,
      name: row.name as string,
      status: row.status as string,
      min_bid: row.min_bid as number,
      team_name: row.team_name as string,
      current_budget: row.current_budget as number,
      locked_credits: row.locked_credits as number,
    }));

    return NextResponse.json(userLeagues);
  } catch (error) {
    console.error("Error fetching user leagues:", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle leghe" },
      { status: 500 }
    );
  }
}
