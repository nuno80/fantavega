// src/app/api/leagues/[league-id]/budget-history/route.ts v.2.0 (Async Turso Migration)
// API Route per recuperare la cronologia delle transazioni di budget.
// 1. Importazioni
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { getBudgetTransactionHistory } from "@/lib/db/services/budget.service";

// 2. Interfaccia per il Contesto della Rotta
interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

// 3. Funzione GET per Recuperare la Cronologia Budget
export async function GET(_request: Request, context: RouteContext) {
  console.log("[API BUDGET_HISTORY GET] Request received.");

  try {
    // 3.1. Autenticazione Utente
    const user = await currentUser();
    if (!user || !user.id) {
      console.warn(
        "[API BUDGET_HISTORY GET] Unauthorized: No user session found or user ID missing."
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
        `[API BUDGET_HISTORY GET] Invalid league ID format: ${leagueIdStr}`
      );
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    console.log(
      `[API BUDGET_HISTORY GET] User ${authenticatedUserId} requesting budget history for league ${leagueIdNum}.`
    );

    // 3.3. Verifica Partecipazione Utente alla Lega
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdNum, authenticatedUserId],
    });
    const participantExists = participantCheckResult.rows.length > 0;

    if (!participantExists) {
      const isAdmin = user.publicMetadata?.role === "admin";
      if (!isAdmin) {
        console.warn(
          `[API BUDGET_HISTORY GET] Forbidden: User ${authenticatedUserId} is not a participant of league ${leagueIdNum}.`
        );
        return NextResponse.json(
          { error: "Forbidden: You are not a participant of this league." },
          { status: 403 }
        );
      }
      console.log(
        `[API BUDGET_HISTORY GET] User ${authenticatedUserId} is admin, proceeding to fetch their own history for league ${leagueIdNum}.`
      );
    }

    // 3.4. Chiamata al Servizio per Ottenere la Cronologia
    const history = await getBudgetTransactionHistory(
      leagueIdNum,
      authenticatedUserId
    );

    console.log(
      `[API BUDGET_HISTORY GET] Successfully retrieved ${history.length} transactions for user ${authenticatedUserId} in league ${leagueIdNum}.`
    );
    return NextResponse.json(history, { status: 200 });
  } catch (error) {
    // 3.5. Gestione Errori Generali
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API BUDGET_HISTORY GET] Error: ${errorMessage}`, error);

    if (
      errorMessage.startsWith("Failed to retrieve budget transaction history")
    ) {
      return NextResponse.json(
        { error: "Could not retrieve budget history at this time." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

// 4. Configurazione della Route
export const dynamic = "force-dynamic";
