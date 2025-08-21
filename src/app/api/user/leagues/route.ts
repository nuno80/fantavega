// src/app/api/user/leagues/route.ts
// API endpoint to get leagues for the current user
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { recordUserLogin } from "@/lib/db/services/session.service";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // Registra login utente
    try {
      await recordUserLogin(user.id);
    } catch (error) {
      console.error("[USER_LEAGUES] Error recording login:", error);
      // Non bloccare la richiesta per errori di sessione
    }

    // Get leagues where the user is a participant
    const userLeagues = db
      .prepare(
        `SELECT 
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
         ORDER BY al.created_at DESC`
      )
      .all(user.id);

    return NextResponse.json(userLeagues);
  } catch (error) {
    console.error("Error fetching user leagues:", error);
    return NextResponse.json(
      { error: "Errore nel recupero delle leghe" },
      { status: 500 }
    );
  }
}
