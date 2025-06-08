//src/app/api/admin/leagues/[league-id]/participants/route.ts
// Assicurati che sia importato se lo usi nella versione completa
import { NextResponse } from "next/server";

// Verifica questo percorso!
import { currentUser } from "@clerk/nextjs/server";

import {
  addParticipantToLeague,
  // Assicurati che sia importato dalla versione completa
  getLeagueParticipants, // Assicurati che sia importato dalla versione completa
} from "@/lib/db/services/auction-league.service";

// Interfaccia per il contesto che include i parametri della rotta (asincroni)
interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

// POST per aggiungere un partecipante
export async function POST(request: Request, context: RouteContext) {
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

    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as { userIdToAdd: string };
    if (!body.userIdToAdd || typeof body.userIdToAdd !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid userIdToAdd in request body" },
        { status: 400 }
      );
    }

    console.log(
      `[API Participants POST] Adding participant for league ${leagueIdNum} by admin: ${user.id} for user: ${body.userIdToAdd}`
    );
    const newParticipant = await addParticipantToLeague(
      leagueIdNum,
      body.userIdToAdd,
      user.id
    );
    return NextResponse.json(newParticipant, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API Participants POST] Error: ${errorMessage}`);
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("not authorized") ||
        error.message.includes("is not a manager") ||
        error.message.includes("already a participant"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to add participant" },
      { status: 500 }
    );
  }
}

// GET per listare i partecipanti
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
export const dynamic = "force-dynamic";
