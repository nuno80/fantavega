// src/app/api/leagues/[league-id]/players/[player-id]/assignment/route.ts v.1.0
// API Route per recuperare lo stato di assegnazione di un giocatore specifico in una lega.
// 1. Importazioni
import { type NextRequest, NextResponse } from "next/server";

// Assicurati che il percorso sia corretto
import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
// Per verificare la partecipazione alla lega dell'utente richiedente
import { getPlayerAssignmentStatus } from "@/lib/db/services/auction-league.service";

// 2. Interfaccia per il Contesto della Rotta
interface RouteContext {
  params: Promise<{
    // params è una Promise come discusso per gli endpoint precedenti
    "league-id": string;
    "player-id": string;
  }>;
}

// 3. Funzione GET per Recuperare lo Stato di Assegnazione del Giocatore
export async function GET(_request: NextRequest, context: RouteContext) {
  console.log("[API PLAYER_ASSIGNMENT_STATUS GET] Request received.");

  try {
    // 3.1. Autenticazione Utente
    const authUser = await currentUser();
    if (!authUser || !authUser.id) {
      console.warn(
        "[API PLAYER_ASSIGNMENT_STATUS GET] Unauthorized: No user session found."
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authenticatedUserId = authUser.id;
    // const authenticatedUserRole = authUser.publicMetadata?.role as string | undefined; // Non strettamente necessario per questa logica se tutti i partecipanti possono vedere

    // 3.2. Parsing e Validazione Parametri Rotta
    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const playerIdStr = routeParams["player-id"];

    const leagueIdNum = parseInt(leagueIdStr, 10);
    const playerIdNum = parseInt(playerIdStr, 10);

    if (isNaN(leagueIdNum) || leagueIdNum <= 0) {
      console.warn(
        `[API PLAYER_ASSIGNMENT_STATUS GET] Invalid league ID format: ${leagueIdStr}`
      );
      return NextResponse.json(
        { error: "Invalid league ID format." },
        { status: 400 }
      );
    }
    if (isNaN(playerIdNum) || playerIdNum <= 0) {
      console.warn(
        `[API PLAYER_ASSIGNMENT_STATUS GET] Invalid player ID format: ${playerIdStr}`
      );
      return NextResponse.json(
        { error: "Invalid player ID format." },
        { status: 400 }
      );
    }

    console.log(
      `[API PLAYER_ASSIGNMENT_STATUS GET] User ${authenticatedUserId} requesting assignment status for player ${playerIdNum} in league ${leagueIdNum}.`
    );

    // 3.3. Autorizzazione: Verifica che l'utente autenticato sia partecipante della lega
    // Questo per assicurare che solo chi è coinvolto nella lega possa vedere lo stato dei giocatori al suo interno.
    // Gli admin di sistema potrebbero bypassare questo controllo se necessario, ma per ora lo richiediamo.
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdNum, authenticatedUserId],
    });
    const isParticipant = participantCheckResult.rows.length > 0;

    const isAdmin = authUser.publicMetadata?.role === "admin";

    if (!isParticipant && !isAdmin) {
      // Se non è partecipante E non è admin
      console.warn(
        `[API PLAYER_ASSIGNMENT_STATUS GET] Forbidden: User ${authenticatedUserId} is not a participant of league ${leagueIdNum} and not an admin.`
      );
      return NextResponse.json(
        {
          error:
            "Forbidden: You are not authorized to view player status for this league.",
        },
        { status: 403 }
      );
    }
    if (isParticipant) {
      console.log(
        `[API PLAYER_ASSIGNMENT_STATUS GET] User ${authenticatedUserId} is participant of league ${leagueIdNum}. Access granted.`
      );
    }
    if (isAdmin && !isParticipant) {
      console.log(
        `[API PLAYER_ASSIGNMENT_STATUS GET] User ${authenticatedUserId} is admin. Access granted to view player status in league ${leagueIdNum}.`
      );
    }

    // 3.4. Chiamata al Servizio per Ottenere lo Stato di Assegnazione
    const assignmentStatus = await getPlayerAssignmentStatus(
      leagueIdNum,
      playerIdNum
    );

    console.log(
      `[API PLAYER_ASSIGNMENT_STATUS GET] Successfully retrieved assignment status for player ${playerIdNum} in league ${leagueIdNum}. Assigned: ${assignmentStatus.is_assigned}`
    );
    return NextResponse.json(assignmentStatus, { status: 200 });
  } catch (error) {
    // 3.5. Gestione Errori Generali
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API PLAYER_ASSIGNMENT_STATUS GET] Error: ${errorMessage}`,
      error
    );

    if (
      errorMessage.startsWith("Failed to retrieve player assignment status")
    ) {
      return NextResponse.json(
        { error: "Could not retrieve player assignment status at this time." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}

// 4. Configurazione della Route
export const dynamic = "force-dynamic";
