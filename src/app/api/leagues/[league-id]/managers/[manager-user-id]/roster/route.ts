// src/app/api/leagues/[league-id]/managers/[manager-user-id]/roster/route.ts v.1.1
// 1. Importazioni (invariate)
import { type NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { getManagerRoster } from "@/lib/db/services/auction-league.service";
import { authorizeLeagueAccess, checkUserDataAccess } from "@/lib/auth/authorization";

// 2. Interfaccia per il Contesto della Rotta (MODIFICATA)
interface RouteContext {
  params: Promise<{
    // << MODIFICA: params ora è una Promise
    "league-id": string;
    "manager-user-id": string;
  }>;
}

// 3. Funzione GET per Recuperare la Rosa del Manager
export async function GET(_request: NextRequest, context: RouteContext) {
  console.log("[API MANAGER_ROSTER GET] Request received.");

  try {
    // 3.1. Autenticazione Utente (invariata)
    const authUser = await currentUser();
    if (!authUser || !authUser.id) {
      console.warn(
        "[API MANAGER_ROSTER GET] Unauthorized: No user session found."
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authenticatedUserId = authUser.id;
    const authenticatedUserRole = authUser.publicMetadata?.role as
      | string
      | undefined;

    // 3.2. Parsing e Validazione Parametri Rotta (MODIFICATO)
    const routeParams = await context.params; // << MODIFICA: Aggiunto await qui
    const leagueIdStr = routeParams["league-id"];
    const managerUserIdFromParams = routeParams["manager-user-id"];

    const leagueIdNum = parseInt(leagueIdStr, 10);

    // ... (resto della funzione GET rimane invariato dalla versione v.1.0 che ti ho dato) ...
    // ovvero, da "if (isNaN(leagueIdNum))" in poi.
    // Per brevità, non ripeto tutto il resto della funzione.
    // Assicurati di avere la logica di autorizzazione, verifica partecipante,
    // chiamata al servizio e gestione errori come nella v.1.0.

    // Esempio del blocco successivo (assicurati sia completo nel tuo file)
    if (isNaN(leagueIdNum)) {
      console.warn(
        `[API MANAGER_ROSTER GET] Invalid league ID format: ${leagueIdStr}`
      );
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }
    if (
      !managerUserIdFromParams ||
      typeof managerUserIdFromParams !== "string"
    ) {
      console.warn(
        `[API MANAGER_ROSTER GET] Invalid or missing manager user ID in path.`
      );
      return NextResponse.json(
        { error: "Invalid or missing manager user ID" },
        { status: 400 }
      );
    }

    console.log(
      `[API MANAGER_ROSTER GET] User ${authenticatedUserId} requesting roster for manager ${managerUserIdFromParams} in league ${leagueIdNum}.`
    );

    // Use centralized authorization check for user data access
    const hasDataAccess = await checkUserDataAccess(
      authenticatedUserId, 
      managerUserIdFromParams, 
      leagueIdNum
    );
    
    if (!hasDataAccess) {
      console.warn(
        `[API MANAGER_ROSTER GET] Forbidden: User ${authenticatedUserId} cannot view roster of ${managerUserIdFromParams}.`
      );
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view this roster." },
        { status: 403 }
      );
    }

    const participantCheckStmt = db.prepare(
      "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participantExists = participantCheckStmt.get(
      leagueIdNum,
      managerUserIdFromParams
    );

    if (!participantExists) {
      if (authenticatedUserId === managerUserIdFromParams) {
        return NextResponse.json(
          { error: `You are not a participant in league ${leagueIdNum}.` },
          { status: 403 }
        );
      }
      console.log(
        `[API MANAGER_ROSTER GET] Manager ${managerUserIdFromParams} not found in league ${leagueIdNum}, roster will be empty.`
      );
    }

    const roster = await getManagerRoster(leagueIdNum, managerUserIdFromParams);

    console.log(
      `[API MANAGER_ROSTER GET] Successfully retrieved ${roster.length} players for manager ${managerUserIdFromParams} in league ${leagueIdNum}.`
    );
    return NextResponse.json(roster, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API MANAGER_ROSTER GET] Error: ${errorMessage}`, error);
    if (errorMessage.startsWith("Failed to retrieve manager roster")) {
      return NextResponse.json(
        { error: "Could not retrieve manager roster at this time." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}

// 4. Configurazione della Route (invariata)
export const dynamic = "force-dynamic";
