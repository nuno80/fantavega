// src/app/api/leagues/[league-id]/auto-bids/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  console.log("[API AUTO-BIDS GET] Request received to list auto-bids.");

  try {
    const user = await currentUser();
    if (!user || !user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { "league-id": leagueIdParam } = await params;
    const leagueId = parseInt(leagueIdParam, 10);
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    // Verifica che l'utente partecipi alla lega
    const participationResult = await db.execute({
      sql: `SELECT 1 FROM league_participants WHERE user_id = ? AND league_id = ?`,
      args: [user.id, leagueId],
    });
    const participation = participationResult.rows[0];

    if (!participation) {
      return NextResponse.json(
        { error: "Non sei autorizzato ad accedere a questa lega" },
        { status: 403 }
      );
    }

    // Restituisce SOLO gli auto-bid dell'utente corrente per privacy
    // Gli altri utenti non devono vedere gli importi degli auto-bid altrui
    const autoBidsResult = await db.execute({
      sql: `
        SELECT
          a.player_id,
          ab.max_amount,
          ab.is_active
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE
      `,
      args: [leagueId, user.id],
    });

    const autoBids = autoBidsResult.rows.map((row) => ({
      player_id: row.player_id as number,
      max_amount: row.max_amount as number,
      is_active: Boolean(row.is_active),
    }));

    return NextResponse.json({ autoBids }, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API AUTO-BIDS GET] Error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: "Failed to retrieve auto-bids." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
