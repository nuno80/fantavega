/**
 * API endpoint per abbandonare volontariamente un'asta
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { abandonAuction } from "@/lib/db/services/response-timer.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { "league-id": leagueIdParam, "player-id": playerIdParam } =
      await params;
    const leagueId = parseInt(leagueIdParam);
    const playerId = parseInt(playerIdParam);

    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json(
        { error: "Parametri non validi" },
        { status: 400 }
      );
    }

    // Abbandona l'asta
    await abandonAuction(userId, leagueId, playerId);

    return NextResponse.json({
      success: true,
      message: "Asta abbandonata. Cooldown di 48h applicato.",
    });
  } catch (error) {
    console.error("[API ABANDON] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Errore interno";
    const statusCode =
      errorMessage.includes("non trovata") ||
      errorMessage.includes("Nessun timer")
        ? 404
        : 500;

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: statusCode }
    );
  }
}
