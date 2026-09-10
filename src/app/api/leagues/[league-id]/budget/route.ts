// src/app/api/leagues/[league-id]/budget/route.ts
// API endpoint to get user's budget information for a specific league
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { db } from "@/lib/db";
import { getUserAuctionLockedExposure } from "@/lib/db/services/locked-credits.service";

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
    const playerIdParam = request.nextUrl.searchParams.get("playerId");
    const playerId =
      playerIdParam === null ? null : Number.parseInt(playerIdParam, 10);

    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    if (
      playerId !== null &&
      (!Number.isSafeInteger(playerId) || playerId <= 0)
    ) {
      return NextResponse.json(
        { error: "ID giocatore non valido" },
        { status: 400 }
      );
    }

    // Policy SEC-005: visibile a partecipanti e admin
    if (!(await hasLeagueAccess(user.id, leagueId, user.publicMetadata?.role as string | undefined))) {
      return NextResponse.json(
        { error: "Non autorizzato per questa lega" },
        { status: 403 }
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

    // Durante un rilancio i crediti già bloccati sulla stessa asta devono
    // essere sostituiti dalla nuova offerta, non conteggiati una seconda volta.
    let currentAuctionExposure = 0;
    if (playerId !== null) {
      const auctionResult = await db.execute({
        sql: `SELECT id
              FROM auctions
              WHERE auction_league_id = ?
                AND player_id = ?
                AND status = 'active'
              ORDER BY created_at DESC
              LIMIT 1`,
        args: [leagueId, playerId],
      });
      const auctionId = Number(auctionResult.rows[0]?.id ?? 0);

      if (auctionId > 0) {
        currentAuctionExposure = await getUserAuctionLockedExposure(
          leagueId,
          user.id,
          auctionId
        );
      }
    }

    return NextResponse.json({
      ...budgetInfo,
      current_auction_exposure: currentAuctionExposure,
    });
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json(
      { error: "Errore nel recupero del budget" },
      { status: 500 }
    );
  }
}
