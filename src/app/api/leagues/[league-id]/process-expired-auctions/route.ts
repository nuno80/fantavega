// src/app/api/leagues/[league-id]/process-expired-auctions/route.ts
// API endpoint to automatically process expired auctions for a specific league
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { processExpiredAuctionsAndAssignPlayers } from "@/lib/db/services/bid.service";

interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    // Verify user is participant in this league (or admin)
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdNum, user.id],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    const userRole = user.publicMetadata?.role as string | undefined;

    if (!participantCheck && userRole !== "admin") {
      return NextResponse.json(
        { error: "Non autorizzato per questa lega" },
        { status: 403 }
      );
    }

    console.log(
      `[API PROCESS_EXPIRED_AUCTIONS] Processing expired auctions for league ${leagueIdNum}`
    );

    // Process expired auctions
    const result = await processExpiredAuctionsAndAssignPlayers();

    console.log(
      `[API PROCESS_EXPIRED_AUCTIONS] Processed ${result.processedCount} auctions, ${result.failedCount} failed`
    );

    return NextResponse.json({
      message: "Aste scadute processate con successo",
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[API PROCESS_EXPIRED_AUCTIONS] Error:", error);
    return NextResponse.json(
      { error: "Errore nel processare le aste scadute" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
