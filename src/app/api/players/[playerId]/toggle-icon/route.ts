import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

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

    const leagueIdNum = parseInt(leagueId, 10);
    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Verifica che l'utente appartenga alla lega (le preferenze sono per-utente
    // e per-lega: ognuno salva le proprie, non si scrivono colonne globali su players)
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE user_id = ? AND league_id = ?",
      args: [user.id, leagueIdNum],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    if (!participantCheck) {
      return NextResponse.json(
        { error: "Non appartieni a questa lega" },
        { status: 403 }
      );
    }

    // Mappa iconType a colonna database (per-utente)
    const columnMap: Record<string, string> = {
      isStarter: "is_starter",
      isFavorite: "is_favorite",
      integrityValue: "integrity_value",
      hasFmv: "has_fmv",
    };
    const column = columnMap[iconType];

    if (!column) {
      return NextResponse.json(
        { error: "Tipo di icona non valido" },
        { status: 400 }
      );
    }

    // Converti il valore per SQLite (boolean -> number)
    let sqliteValue: number | string;
    if (typeof value === "boolean") {
      sqliteValue = value ? 1 : 0;
    } else {
      sqliteValue = value as number;
    }

    const now = Math.floor(Date.now() / 1000);

    // Upsert della preferenza per-utente/per-lega
    await db.execute({
      sql: `
        INSERT INTO user_player_preferences (user_id, player_id, league_id, ${column}, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, player_id, league_id)
        DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at
      `,
      args: [user.id, playerId, leagueIdNum, sqliteValue, now],
    });

    // Recupera la preferenza aggiornata
    const updatedPreferenceResult = await db.execute({
      sql: `
        SELECT * FROM user_player_preferences
        WHERE user_id = ? AND player_id = ? AND league_id = ?
      `,
      args: [user.id, playerId, leagueIdNum],
    });
    const updatedPreference = updatedPreferenceResult.rows[0];

    return NextResponse.json({
      success: true,
      player: updatedPreference,
    });
  } catch (error) {
    console.error("Errore nell'aggiornare l'icona:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
