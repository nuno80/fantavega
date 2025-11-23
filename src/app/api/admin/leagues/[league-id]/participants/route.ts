// src/app/api/admin/leagues/[league-id]/participants/route.ts v.1.1
// API Route per aggiungere (POST) e listare (GET) partecipanti a una lega.
// 1. Importazioni
// Corretto
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
// Importa db per il debug diretto
import {
  addParticipantToLeague,
  getLeagueParticipants,
} from "@/lib/db/services/auction-league.service";

// 2. Interfaccia per il Contesto della Rotta
interface RouteContext {
  params: Promise<{
    // context.params è una Promise
    "league-id": string;
  }>;
}

// 3. Funzione POST per Aggiungere un Partecipante
export async function POST(request: Request, context: RouteContext) {
  try {
    // 3.1. Autenticazione e Autorizzazione Admin
    const adminUser = await currentUser(); // adminUser è l'utente che fa la chiamata
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Assumiamo che il ruolo sia in publicMetadata
    const isAdmin = adminUser.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: User is not an admin" },
        { status: 403 }
      );
    }
    const adminIdentifiedId = adminUser.id; // ID dell'admin che esegue l'azione

    // 3.2. Parsing dei Parametri della Rotta e del Corpo della Richiesta
    const routeParams = await context.params; // Risolvi la Promise per i parametri
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      userIdToAdd?: string;
      teamName?: string;
    }; // userIdToAdd è opzionale per il check
    const participantUserIdToAdd = body.userIdToAdd;

    if (!participantUserIdToAdd || typeof participantUserIdToAdd !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid userIdToAdd in request body" },
        { status: 400 }
      );
    }

    console.log(
      `[API Participants POST] Attempting to add participant for league ${leagueIdNum} by admin: ${adminIdentifiedId} for user: ${participantUserIdToAdd}`
    );

    // !!! INIZIO BLOCCO DEBUG !!!
    console.log(
      `[API Participants DEBUG] League ID being processed: ${leagueIdNum}`
    );
    console.log(
      `[API Participants DEBUG] Admin ID being passed to service (adminUserId): '${adminIdentifiedId}' (length: ${adminIdentifiedId.length})`
    );
    console.log(
      `[API Participants DEBUG] Participant ID to add being passed to service (participantUserId): '${participantUserIdToAdd}' (length: ${participantUserIdToAdd.length})`
    );

    try {
      const leagueCheckResult = await db.execute({
        sql: "SELECT admin_creator_id FROM auction_leagues WHERE id = ?",
        args: [leagueIdNum],
      });
      const leagueFromDb = leagueCheckResult.rows[0] as unknown as
        | { admin_creator_id: string }
        | undefined;
      if (leagueFromDb) {
        console.log(
          `[API Participants DEBUG] admin_creator_id FROM DB for league ${leagueIdNum}: '${leagueFromDb.admin_creator_id}' (length: ${leagueFromDb.admin_creator_id.length})`
        );
        console.log(
          `[API Participants DEBUG] Comparison (adminIdentifiedId === leagueFromDb.admin_creator_id): ${adminIdentifiedId === leagueFromDb.admin_creator_id}`
        );
      } else {
        console.log(
          `[API Participants DEBUG] League ${leagueIdNum} not found in DB for debug check.`
        );
      }
    } catch (dbError) {
      console.error(
        "[API Participants DEBUG] Error fetching league for debug check:",
        dbError
      );
    }
    // !!! FINE BLOCCO DEBUG !!!

    // 3.3. Chiamata al Servizio con i Parametri nell'Ordine CORRETTO
    const result = await addParticipantToLeague(
      leagueIdNum, // 1° parametro: leagueId
      adminIdentifiedId, // 2° parametro: adminUserId (l'admin che fa la chiamata)
      participantUserIdToAdd, // 3° parametro: participantUserId (l'utente da aggiungere)
      body.teamName || "Squadra Senza Nome" // 4° parametro: teamName
    );

    // 3.4. Gestione della Risposta del Servizio
    if (result.success) {
      return NextResponse.json(
        {
          message: result.message,
          participant_user_id: result.participant_user_id,
        },
        { status: 201 } // 201 Created se il partecipante è stato aggiunto
        // Potresti voler cambiare status se il messaggio è "Participant already in league"
      );
    } else {
      // Se il servizio restituisce success: false, usa il messaggio del servizio
      // e determina uno status code appropriato (es. 400 per errori di validazione, 404 se utente non trovato)
      let statusCode = 400; // Default per errori di validazione dal servizio
      if (result.message.includes("not found")) statusCode = 404;
      if (result.message.includes("Only the league administrator"))
        statusCode = 403; // Anche se l'admin check sopra dovrebbe prenderlo

      return NextResponse.json(
        { error: result.message },
        { status: statusCode }
      );
    }
  } catch (error) {
    // 3.5. Gestione Errori Generali
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API Participants POST] Error: ${errorMessage}`, error); // Logga l'errore completo

    // Se l'errore è di parsing JSON
    if (
      error instanceof SyntaxError &&
      errorMessage.toLowerCase().includes("json")
    ) {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to add participant due to an unexpected server error." },
      { status: 500 }
    );
  }
}

// 4. Funzione GET per Listare i Partecipanti (INVARIATA - come nel tuo file)
export async function GET(_request: Request, context: RouteContext) {
  console.log(
    "!!!!!!!!!! GET HANDLER REACHED for /api/admin/leagues/[league-id]/participants !!!!!!!!!!"
  );
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: Only admin can view all participants" },
        { status: 403 }
      );
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

    console.log(
      `[API Participants GET] Listing participants for league ${leagueIdNum} by user: ${user.id}`
    );
    const participants = await getLeagueParticipants(leagueIdNum);
    return NextResponse.json(participants, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API Participants GET] Error: ${errorMessage}`);
    return NextResponse.json(
      { error: "Failed to retrieve participants" },
      { status: 500 }
    );
  }
}

// 5. Configurazione della Route
export const dynamic = "force-dynamic";
