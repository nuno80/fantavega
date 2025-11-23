import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  const params_resolved = await params;
  const leagueId = parseInt(params_resolved["league-id"]);
  const playerId = parseInt(params_resolved["player-id"]);

  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Non sei autenticato" },
        { status: 401 }
      );
    }

    // Verifica che l'utente appartenga alla lega
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE user_id = ? AND league_id = ?",
      args: [user.id, leagueId],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    if (!participantCheck) {
      return NextResponse.json(
        { error: "Non appartieni a questa lega" },
        { status: 403 }
      );
    }

    // Validazione parametri
    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json(
        { error: "Parametri non validi" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { iconType, value } = body;

    if (!iconType || value === undefined) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    // Validazione iconType
    const validIconTypes = [
      "isStarter",
      "isFavorite",
      "integrityValue",
      "hasFmv",
    ];
    if (!validIconTypes.includes(iconType)) {
      return NextResponse.json(
        { error: "Tipo di preferenza non valido" },
        { status: 400 }
      );
    }

    // Mappa iconType a colonna database
    const columnMap: Record<string, string> = {
      isStarter: "is_starter",
      isFavorite: "is_favorite",
      integrityValue: "integrity_value",
      hasFmv: "has_fmv",
    };

    const column = columnMap[iconType];

    // Converti il valore per SQLite (boolean -> number)
    let sqliteValue: number | string;
    if (typeof value === "boolean") {
      sqliteValue = value ? 1 : 0;
    } else {
      sqliteValue = value as number;
    }

    const now = Math.floor(Date.now() / 1000);

    // Upsert della preferenza
    await db.execute({
      sql: `
        INSERT INTO user_player_preferences (user_id, player_id, league_id, ${column}, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, player_id, league_id)
        DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at
      `,
      args: [user.id, playerId, leagueId, sqliteValue, now],
    });

    // Recupera la preferenza aggiornata
    const updatedPreferenceResult = await db.execute({
      sql: `
        SELECT * FROM user_player_preferences
        WHERE user_id = ? AND player_id = ? AND league_id = ?
      `,
      args: [user.id, playerId, leagueId],
    });
    const updatedPreference = updatedPreferenceResult.rows[0];

    return NextResponse.json({
      success: true,
      preference: updatedPreference,
    });
  } catch (error) {
    console.error("Errore nell'aggiornare la preferenza:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  const params_resolved = await params;
  const leagueId = parseInt(params_resolved["league-id"]);
  const playerId = parseInt(params_resolved["player-id"]);

  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Non sei autenticato" },
        { status: 401 }
      );
    }

    // Verifica che l'utente appartenga alla lega
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE user_id = ? AND league_id = ?",
      args: [user.id, leagueId],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    if (!participantCheck) {
      return NextResponse.json(
        { error: "Non appartieni a questa lega" },
        { status: 403 }
      );
    }

    // Validazione parametri
    if (isNaN(leagueId) || isNaN(playerId)) {
      return NextResponse.json(
        { error: "Parametri non validi" },
        { status: 400 }
      );
    }

    // Recupera le preferenze dell'utente per questo giocatore in questa lega
    const preferenceResult = await db.execute({
      sql: `
        SELECT * FROM user_player_preferences
        WHERE user_id = ? AND player_id = ? AND league_id = ?
      `,
      args: [user.id, playerId, leagueId],
    });
    const preference = preferenceResult.rows[0];

    return NextResponse.json({
      preference: preference || {
        user_id: user.id,
        player_id: playerId,
        league_id: leagueId,
        is_starter: false,
        is_favorite: false,
        integrity_value: 0,
        has_fmv: false,
      },
    });
  } catch (error) {
    console.error("Errore nel recuperare le preferenze:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
