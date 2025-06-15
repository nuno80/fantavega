// src/app/api/admin/tasks/process-auctions/route.ts v.1.3
// API Route per triggerare manualmente il processamento delle aste scadute.
// 1. Importazioni
// Utilizziamo currentUser come in leagues/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { processExpiredAuctionsAndAssignPlayers } from "@/lib/db/services/bid.service";

// Non è necessario importare clerkClient esplicitamente se usiamo solo currentUser

// 2. Funzione POST per Triggerare il Processamento delle Aste
export async function POST(_request: Request) {
  console.log(
    "[API ADMIN_PROCESS_AUCTIONS] Received request to process expired auctions."
  );

  // 2.1. Autenticazione e Autorizzazione Admin
  const user = await currentUser(); // currentUser() è una Promise

  if (!user) {
    console.warn(
      "[API ADMIN_PROCESS_AUCTIONS] Unauthorized: No user session found."
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accedi al ruolo tramite publicMetadata dell'oggetto user
  // Assicurati che il ruolo 'admin' sia impostato in publicMetadata nel dashboard di Clerk
  // o tramite API quando crei/aggiorni l'utente.
  const userRole = user.publicMetadata?.role as string | undefined;

  if (userRole !== "admin") {
    console.warn(
      `[API ADMIN_PROCESS_AUCTIONS] Forbidden: User ${user.id} with role '${userRole}' attempted to process auctions.`
    );
    return NextResponse.json(
      {
        error: "Forbidden: You do not have permission to perform this action.",
      },
      { status: 403 }
    );
  }

  console.log(
    `[API ADMIN_PROCESS_AUCTIONS] Admin user ${user.id} authorized (role: ${userRole}). Initiating auction processing...`
  );

  // =====================================================================================
  // !! SEZIONE CHIAVE PER IL TEST DELLA LOGICA DI BUSINESS !!
  // Chiamata alla funzione del servizio che contiene la logica principale
  // per identificare le aste scadute, aggiornare stati, budget, e assegnare giocatori.
  // =====================================================================================
  try {
    const result = await processExpiredAuctionsAndAssignPlayers();

    console.log(
      "[API ADMIN_PROCESS_AUCTIONS] Auction processing completed.",
      result
    );
    return NextResponse.json(
      {
        message: "Auction processing task executed.",
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        errors: result.errors,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during auction processing.";
    console.error(
      "[API ADMIN_PROCESS_AUCTIONS] Critical error during auction processing task:",
      error
    );
    return NextResponse.json(
      {
        error: "An unexpected error occurred while processing auctions.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

// 3. Configurazione della Route
export const dynamic = "force-dynamic";

/**
 * Come testare questo endpoint:
 * ... (commenti di test invariati) ...
 */
