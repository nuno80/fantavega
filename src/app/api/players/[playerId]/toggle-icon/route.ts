import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { updatePlayer } from "@/lib/db/services/player.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  // In Next.js 15, params è una Promise
  const params_resolved = await params;
  const playerIdParam = params_resolved.playerId;
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Non sei autenticato" },
        { status: 401 }
      );
    }

    // Verifica che l'utente abbia il ruolo di manager o admin
    const userRole = user.publicMetadata?.role as string;
    if (userRole !== "manager" && userRole !== "admin") {
      return NextResponse.json(
        { error: "Non hai i permessi necessari" },
        { status: 403 }
      );
    }

    const playerId = parseInt(playerIdParam);
    if (isNaN(playerId)) {
      return NextResponse.json(
        { error: "ID giocatore non valido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { iconType, value, leagueId } = body;

    // Verifica che i parametri siano validi
    if (!iconType || value === undefined || !leagueId) {
      return NextResponse.json(
        { error: "Parametri mancanti o non validi" },
        { status: 400 }
      );
    }

    // Prepara i dati per l'aggiornamento
    const updateData: Record<string, unknown> = {};

    switch (iconType) {
      case "isStarter":
        updateData.is_starter = value;
        break;
      case "isFavorite":
        updateData.is_favorite = value;
        break;
      case "integrityValue":
        updateData.integrity_value = value;
        break;
      case "hasFmv":
        updateData.has_fmv = value;
        break;
      default:
        return NextResponse.json(
          { error: "Tipo di icona non valido" },
          { status: 400 }
        );
    }

    // Aggiorna il giocatore utilizzando il servizio
    const updatedPlayer = updatePlayer(playerId, updateData);

    if (!updatedPlayer) {
      return NextResponse.json(
        { error: "Giocatore non trovato" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      player: updatedPlayer,
    });
  } catch (error) {
    console.error("Errore nell'aggiornare l'icona:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
