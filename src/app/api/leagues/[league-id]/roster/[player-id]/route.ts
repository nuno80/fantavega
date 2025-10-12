// src/app/api/leagues/[league-id]/roster/[player-id]/route.ts
// API endpoint per svincolare un giocatore dalla propria rosa.
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { releasePlayerFromRoster } from "@/lib/db/services/roster.service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { "league-id": string; "player-id": string } }
) {
  const { "league-id": leagueIdStr, "player-id": playerIdStr } = params;

  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const leagueId = parseInt(leagueIdStr);
    const playerId = parseInt(playerIdStr);

    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json(
        { error: "ID lega o ID giocatore non validi." },
        { status: 400 }
      );
    }

    const result = releasePlayerFromRoster(leagueId, playerId, user.id);

    console.log(
      `[API-RELEASE] User ${user.id} released player ${playerId} from league ${leagueId}. Credits refunded: ${result.creditsRefunded}`
    );

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Errore sconosciuto durante lo svincolo del giocatore.";

    console.error(
      `[API-RELEASE] Error releasing player ${playerIdStr} from league ${leagueIdStr}:`,
      errorMessage
    );

    // Restituisce un errore specifico basato sul messaggio del servizio
    if (errorMessage.includes("non appartiene alla tua rosa")) {
      return NextResponse.json({ error: errorMessage }, { status: 403 }); // Forbidden
    }
    if (errorMessage.includes("solo durante la fase")) {
      return NextResponse.json({ error: errorMessage }, { status: 409 }); // Conflict
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
