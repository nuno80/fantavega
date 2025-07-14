import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { authorizeLeagueAccess } from "@/lib/auth/authorization";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "league-id": string; "player-id": string }> }
) {
  const params_resolved = await params;
  const leagueId = parseInt(params_resolved["league-id"]);
  const playerId = parseInt(params_resolved["player-id"]);

  try {
    // Use centralized authorization check to prevent IDOR
    const authResult = await authorizeLeagueAccess(leagueId);
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    
    const user = authResult.user;

    // Validazione parametri
    if (isNaN(playerId) || playerId <= 0) {
      return NextResponse.json(
        { error: "ID giocatore non valido" },
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
    const validIconTypes = ['isStarter', 'isFavorite', 'integrityValue', 'hasFmv'];
    if (!validIconTypes.includes(iconType)) {
      return NextResponse.json(
        { error: "Tipo di preferenza non valido" },
        { status: 400 }
      );
    }

    // Mappa iconType a colonna database
    const columnMap: Record<string, string> = {
      'isStarter': 'is_starter',
      'isFavorite': 'is_favorite', 
      'integrityValue': 'integrity_value',
      'hasFmv': 'has_fmv'
    };

    const column = columnMap[iconType];
    if (!column) {
      return NextResponse.json(
        { error: "Tipo di preferenza non valido" },
        { status: 400 }
      );
    }
    
    // Converti il valore per SQLite (boolean -> number)
    let sqliteValue: number;
    if (typeof value === 'boolean') {
      sqliteValue = value ? 1 : 0;
    } else if (typeof value === 'number') {
      // Validazione range per integrity_value
      if (iconType === 'integrityValue' && (value < 0 || value > 10)) {
        return NextResponse.json(
          { error: "Valore integrita deve essere tra 0 e 10" },
          { status: 400 }
        );
      }
      sqliteValue = value;
    } else {
      return NextResponse.json(
        { error: "Tipo di valore non valido" },
        { status: 400 }
      );
    }
    
    // Upsert sicuro senza interpolazione dinamica - evita SQL injection
    let upsertStmt;
    switch (iconType) {
      case 'isStarter':
        upsertStmt = db.prepare(`
          INSERT INTO user_player_preferences (user_id, player_id, league_id, is_starter, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s', 'now'))
          ON CONFLICT(user_id, player_id, league_id) 
          DO UPDATE SET is_starter = excluded.is_starter, updated_at = excluded.updated_at
        `);
        break;
      case 'isFavorite':
        upsertStmt = db.prepare(`
          INSERT INTO user_player_preferences (user_id, player_id, league_id, is_favorite, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s', 'now'))
          ON CONFLICT(user_id, player_id, league_id) 
          DO UPDATE SET is_favorite = excluded.is_favorite, updated_at = excluded.updated_at
        `);
        break;
      case 'integrityValue':
        upsertStmt = db.prepare(`
          INSERT INTO user_player_preferences (user_id, player_id, league_id, integrity_value, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s', 'now'))
          ON CONFLICT(user_id, player_id, league_id) 
          DO UPDATE SET integrity_value = excluded.integrity_value, updated_at = excluded.updated_at
        `);
        break;
      case 'hasFmv':
        upsertStmt = db.prepare(`
          INSERT INTO user_player_preferences (user_id, player_id, league_id, has_fmv, updated_at)
          VALUES (?, ?, ?, ?, strftime('%s', 'now'))
          ON CONFLICT(user_id, player_id, league_id) 
          DO UPDATE SET has_fmv = excluded.has_fmv, updated_at = excluded.updated_at
        `);
        break;
      default:
        return NextResponse.json(
          { error: "Tipo di preferenza non supportato" },
          { status: 400 }
        );
    }

    upsertStmt.run(user.id, playerId, leagueId, sqliteValue);

    // Recupera la preferenza aggiornata
    const updatedPreference = db
      .prepare(`
        SELECT * FROM user_player_preferences 
        WHERE user_id = ? AND player_id = ? AND league_id = ?
      `)
      .get(user.id, playerId, leagueId);

    return NextResponse.json({
      success: true,
      preference: updatedPreference
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
    const participantCheck = db
      .prepare("SELECT 1 FROM league_participants WHERE user_id = ? AND league_id = ?")
      .get(user.id, leagueId);

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
    const preference = db
      .prepare(`
        SELECT * FROM user_player_preferences 
        WHERE user_id = ? AND player_id = ? AND league_id = ?
      `)
      .get(user.id, playerId, leagueId);

    return NextResponse.json({
      preference: preference || {
        user_id: user.id,
        player_id: playerId,
        league_id: leagueId,
        is_starter: false,
        is_favorite: false,
        integrity_value: 0,
        has_fmv: false
      }
    });

  } catch (error) {
    console.error("Errore nel recuperare le preferenze:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}