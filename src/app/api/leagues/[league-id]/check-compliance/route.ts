// src/app/api/leagues/[league-id]/check-compliance/route.ts v.1.0
// API Route per triggerare il controllo di conformità ai requisiti di rosa
// e l'applicazione di eventuali penalità per l'utente autenticato in una specifica lega.
// 1. Importazioni
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
// Usato per verificare la partecipazione alla lega
import { processUserComplianceAndPenalties } from "@/lib/db/services/penalty.service";

// 2. Interfaccia per il Contesto della Rotta
interface RouteContext {
  params: Promise<{
    // params è una Promise come discusso per l'endpoint budget-history
    "league-id": string;
  }>;
}

// 3. Funzione POST per Triggerare il Controllo di Conformità
// Usiamo POST perché questa operazione può modificare lo stato del database (applicare penalità)
export async function POST(
  _request: Request, // request non è usato, ma necessario per la firma
  context: RouteContext
) {
  console.log("[API CHECK_COMPLIANCE POST] Request received.");

  try {
    // 3.1. Autenticazione Utente
    const user = await currentUser();
    if (!user || !user.id) {
      console.warn(
        "[API CHECK_COMPLIANCE POST] Unauthorized: No user session found or user ID missing."
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authenticatedUserId = user.id;

    // 3.2. Parsing e Validazione Parametri Rotta
    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      console.warn(
        `[API CHECK_COMPLIANCE POST] Invalid league ID format: ${leagueIdStr}`
      );
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    console.log(
      `[API CHECK_COMPLIANCE POST] User ${authenticatedUserId} initiating compliance check for league ${leagueIdNum}.`
    );

    // 3.3. Verifica Partecipazione Utente alla Lega
    // Un utente può triggerare il check solo per una lega a cui partecipa.
    const participantCheckStmt = db.prepare(
      "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const participantExists = participantCheckStmt.get(
      leagueIdNum,
      authenticatedUserId
    );

    if (!participantExists) {
      // Se l'utente non è partecipante, non può triggerare il check per questa lega.
      // Anche un admin di sistema, per questo endpoint, deve essere un partecipante
      // se l'endpoint è strutturato per l'utente "corrente".
      // Un endpoint admin separato potrebbe permettere di triggerare per qualsiasi utente.
      console.warn(
        `[API CHECK_COMPLIANCE POST] Forbidden: User ${authenticatedUserId} is not a participant of league ${leagueIdNum}.`
      );
      return NextResponse.json(
        { error: "Forbidden: You are not a participant of this league." },
        { status: 403 }
      );
    }

    // 3.4. Chiamata al Servizio per Processare Conformità e Penalità
    const result = await processUserComplianceAndPenalties(
      leagueIdNum,
      authenticatedUserId
    );

    console.log(
      `[API CHECK_COMPLIANCE POST] Compliance check for user ${authenticatedUserId} in league ${leagueIdNum} completed. Message: ${result.message}`
    );
    return NextResponse.json(
      {
        message: result.message,
        appliedPenaltyAmount: result.appliedPenaltyAmount,
        isNowCompliant: result.isNowCompliant,
      },
      { status: 200 } // 200 OK perché l'operazione di check è stata eseguita
      // Il corpo della risposta indica l'esito specifico.
    );
  } catch (error) {
    // 3.5. Gestione Errori Generali
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API CHECK_COMPLIANCE POST] Error: ${errorMessage}`, error);

    if (
      errorMessage.startsWith("Failed to process user compliance and penalties")
    ) {
      return NextResponse.json(
        { error: "Could not process compliance check at this time." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred during compliance check." },
      { status: 500 }
    );
  }
}

// 4. Configurazione della Route
export const dynamic = "force-dynamic"; // Assicura che venga eseguita ad ogni chiamata
