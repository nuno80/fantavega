// src/app/api/admin/leagues/[league-id]/participants/[participant-user-id]/route.ts
import { NextResponse } from "next/server";

// Adatta il percorso se necessario
import { currentUser } from "@clerk/nextjs/server";

import { removeParticipantFromLeague } from "@/lib/db/services/auction-league.service";

// Interfaccia per il contesto che include i parametri della rotta (asincroni)
interface RouteContext {
  params: Promise<{
    // params è una Promise
    "league-id": string;
    "participant-user-id": string;
  }>;
}

// DELETE per rimuovere un partecipante
export async function DELETE(
  _request: Request,
  context: RouteContext // Usa la tua interfaccia RouteParams
) {
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

    const routeParams = await context.params; // Await dei parametri
    const leagueIdStr = routeParams["league-id"];
    const participantUserIdToRemove = routeParams["participant-user-id"]; // Puoi accedere direttamente se la chiave è valida come identificatore JS

    const leagueIdNum = parseInt(leagueIdStr, 10);
    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    if (
      !participantUserIdToRemove ||
      typeof participantUserIdToRemove !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid participant User ID format" },
        { status: 400 }
      );
    }

    console.log(
      `[API] DELETE /api/admin/leagues/${leagueIdNum}/participants/${participantUserIdToRemove} by admin: ${user.id}`
    );
    const result = await removeParticipantFromLeague(
      leagueIdNum,
      participantUserIdToRemove,
      user.id
    );

    if (result.success) {
      return NextResponse.json(
        { message: result.message || "Participant removed successfully" },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: result.message || "Failed to remove participant" },
        { status: 400 }
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API] DELETE /api/admin/leagues/[league-id]/participants/["participant-user-id"] error: ${errorMessage}`
    );
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("not authorized"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to remove participant" },
      { status: 500 }
    );
  }
}
