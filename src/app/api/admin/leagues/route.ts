// src/app/api/admin/leagues/route.ts
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  // Cambiato da getAuctionLeaguesByAdmin
  type CreateAuctionLeagueData,
  createAuctionLeague,
  getLeaguesForAdminList,
} from "@/lib/db/services/auction-league.service";

export const POST = async (request: Request): Promise<NextResponse> => {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: User is not an admin" },
        { status: 403 }
      );
    }
    const body = (await request.json()) as CreateAuctionLeagueData;

    if (
      !body.name ||
      !body.league_type ||
      body.initial_budget_per_manager === undefined ||
      body.slots_P === undefined ||
      body.slots_D === undefined ||
      body.slots_C === undefined ||
      body.slots_A === undefined
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (!["classic", "mantra"].includes(body.league_type)) {
      return NextResponse.json(
        { error: "Invalid league_type" },
        { status: 400 }
      );
    }
    if (
      typeof body.initial_budget_per_manager !== "number" ||
      body.initial_budget_per_manager <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid initial_budget_per_manager" },
        { status: 400 }
      );
    }
    if (
      typeof body.slots_P !== "number" ||
      body.slots_P <= 0 ||
      typeof body.slots_D !== "number" ||
      body.slots_D <= 0 ||
      typeof body.slots_C !== "number" ||
      body.slots_C <= 0 ||
      typeof body.slots_A !== "number" ||
      body.slots_A <= 0
    ) {
      return NextResponse.json(
        { error: "Player slots for each role must be positive numbers." },
        { status: 400 }
      );
    }

    const newLeague = await createAuctionLeague(body, user.id);
    return NextResponse.json(newLeague, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`/api/admin/leagues POST error: ${errorMessage}`);
    if (error instanceof Error) {
      if (
        error.message.includes("already exists") ||
        error.message.includes("cannot be empty") ||
        error.message.includes("must be positive") ||
        error.message.includes("Player slots")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json(
      { error: "Failed to create league" },
      { status: 500 }
    );
  }
};

export const GET = async (_request: Request): Promise<NextResponse> => {
  console.log(
    "!!!!!!!!!! HANDLER REACHED: GET /api/admin/leagues (BASE ROUTE) !!!!!!!!!!"
  );
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: User is not an admin" },
        { status: 403 }
      );
    }

    console.log(`[API] GET /api/admin/leagues request by admin: ${user.id}`);

    // Utilizza la funzione che recupera tutte le leghe per l'admin
    const allLeagues = await getLeaguesForAdminList();

    // Trasforma i dati per adattarli a ciò che il frontend si aspetta
    const formattedLeagues = allLeagues.map((league) => ({
      id: league.id,
      name: league.name,
      status: league.status,
      league_type: league.leagueType, // Rinomina leagueType in league_type
    }));

    // Invia la risposta nel formato atteso: { leagues: [...] }
    return NextResponse.json({ leagues: formattedLeagues }, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API] GET /api/admin/leagues error: ${errorMessage}`);
    return NextResponse.json(
      { error: "Failed to retrieve leagues" },
      { status: 500 }
    );
  }
};
