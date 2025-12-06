// src/app/api/players/route.ts v.1.0
// API Route per listare e filtrare i giocatori.
// 1. Importazioni
import { type NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  type GetPlayersOptions,
  type GetPlayersResult,
  getPlayers,
} from "@/lib/db/services/player.service";
import { getUserCooldownInfo } from "@/lib/db/services/response-timer.service";

// 2. Funzione GET per Recuperare i Giocatori
export async function GET(request: NextRequest) {
  console.log("[API PLAYERS GET] Request received to list players.");

  try {
    // 2.1. Estrarre i parametri di query dall'URL
    const searchParams = request.nextUrl.searchParams;

    const name = searchParams.get("name") || undefined;
    const role = searchParams.get("role")?.toUpperCase() || undefined;
    const team = searchParams.get("team") || undefined;
    const leagueIdStr = searchParams.get("leagueId");
    const leagueId = leagueIdStr ? parseInt(leagueIdStr, 10) : undefined;

    const sortBy =
      (searchParams.get("sortBy") as GetPlayersOptions["sortBy"]) || "name";
    const sortOrder =
      (searchParams.get("sortOrder") as GetPlayersOptions["sortOrder"]) ||
      "asc";

    const pageStr = searchParams.get("page");
    const limitStr = searchParams.get("limit");

    const page = pageStr ? parseInt(pageStr, 10) : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    // Validazione aggiuntiva per i parametri numerici
    if (pageStr && (isNaN(page!) || page! <= 0)) {
      return NextResponse.json(
        { error: "Invalid 'page' parameter. Must be a positive number." },
        { status: 400 }
      );
    }
    if (limitStr && (isNaN(limit!) || limit! <= 0)) {
      return NextResponse.json(
        { error: "Invalid 'limit' parameter. Must be a positive number." },
        { status: 400 }
      );
    }
    if (role && !["P", "D", "C", "A"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid 'role' parameter. Must be P, D, C, or A." },
        { status: 400 }
      );
    }
    const validSortByFields = [
      "name",
      "role",
      "team",
      "current_quotation",
      "fvm",
    ];
    if (sortBy && !validSortByFields.includes(sortBy)) {
      return NextResponse.json(
        {
          error: `Invalid 'sortBy' parameter. Allowed values: ${validSortByFields.join(", ")}.`,
        },
        { status: 400 }
      );
    }
    if (sortOrder && !["asc", "desc"].includes(sortOrder.toLowerCase())) {
      return NextResponse.json(
        { error: "Invalid 'sortOrder' parameter. Must be 'asc' or 'desc'." },
        { status: 400 }
      );
    }

    const user = await currentUser();
    const userId = user?.id;

    if (!user) {
      console.warn("[API PLAYERS GET] No user authenticated! returning public/default data.");
    } else {
      console.log(`[API PLAYERS GET] User authenticated: ${userId}`);
    }

    const options: GetPlayersOptions = {
      name,
      role,
      team,
      sortBy,
      sortOrder,
      page,
      limit,
      leagueId,
      userId,
    };

    // Rimuovi le chiavi con valore undefined per non passarle al servizio se non specificate
    Object.keys(options).forEach((key) => {
      const K = key as keyof GetPlayersOptions;
      if (options[K] === undefined) {
        delete options[K];
      }
    });

    console.log("[API PLAYERS GET] Calling service with options:", options);

    // 2.2. Chiamata al Servizio
    const result: GetPlayersResult = await getPlayers(options);

    // 2.3. Aggiungere informazioni sui cooldown per l'utente corrente
    // user variable is already fetched above
    if (user?.id) {
      const playersWithCooldown = await Promise.all(
        result.players.map(async (player) => {
          const cooldownInfo = await getUserCooldownInfo(user.id, player.id);
          return {
            ...player,
            cooldownInfo: cooldownInfo.canBid
              ? null
              : {
                timeRemaining: cooldownInfo.timeRemaining,
                message: cooldownInfo.message,
              },
          };
        })
      );

      return NextResponse.json(
        {
          ...result,
          players: playersWithCooldown,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // 2.3. Gestione Errori Generali
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API PLAYERS GET] Error: ${errorMessage}`, error);

    if (errorMessage.startsWith("Failed to retrieve players")) {
      // Errore specifico dal nostro servizio
      return NextResponse.json(
        { error: "Could not retrieve players at this time." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}

// 3. Configurazione della Route
export const dynamic = "force-dynamic"; // Per assicurare dati freschi, anche se per liste potrebbe andare bene la cache di default
