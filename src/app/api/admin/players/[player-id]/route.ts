// src/app/api/admin/players/[player-id]/route.ts v.1.0
// API Route per aggiornare (PUT) ed eliminare (DELETE) un giocatore (solo Admin).
import { type NextRequest, NextResponse } from "next/server";

// Adatta il percorso
import { currentUser } from "@clerk/nextjs/server";

import {
  type UpdatePlayerData,
  deletePlayer,
  updatePlayer,
} from "@/lib/db/services/player.service";

interface RouteContext {
  params: Promise<{
    "player-id": string;
  }>;
}

// PUT per aggiornare un giocatore
export async function PUT(request: NextRequest, context: RouteContext) {
  const resolvedParams = await context.params;
  const playerIdStr = resolvedParams["player-id"];
  console.log(
    `[API ADMIN_PLAYERS PUT] Request to update player ID: ${playerIdStr}`
  );
  try {
    const adminUser = await currentUser();
    if (!adminUser || adminUser.publicMetadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const playerId = parseInt(playerIdStr, 10);
    if (isNaN(playerId) || playerId <= 0) {
      return NextResponse.json(
        { error: "Invalid player ID." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdatePlayerData;
    if (Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "No update data provided." },
        { status: 400 }
      );
    }
    // Aggiungere validazioni più specifiche per i campi in body se necessario

    const updatedPlayer = await updatePlayer(playerId, body);

    if (!updatedPlayer) {
      return NextResponse.json(
        { error: `Player with ID ${playerId} not found or no changes made.` },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedPlayer, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API ADMIN_PLAYERS PUT] Error updating player ID ${playerIdStr}:`,
      errorMessage
    );
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Failed to update player: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// DELETE per eliminare un giocatore
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const resolvedParams = await context.params;
  const playerIdStr = resolvedParams["player-id"];
  console.log(
    `[API ADMIN_PLAYERS DELETE] Request to delete player ID: ${playerIdStr}`
  );
  try {
    const adminUser = await currentUser();
    if (!adminUser || adminUser.publicMetadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const playerId = parseInt(playerIdStr, 10);
    if (isNaN(playerId) || playerId <= 0) {
      return NextResponse.json(
        { error: "Invalid player ID." },
        { status: 400 }
      );
    }

    const result = await deletePlayer(playerId);

    if (!result.success) {
      // Il servizio deletePlayer ora lancia eccezioni per errori DB, quindi questo blocco
      // potrebbe essere raggiunto solo se deletePlayer restituisce { success: false } per "not found".
      // Gli errori DB Constraint dovrebbero essere catturati dal catch generale.
      const statusCode = result.message?.includes("not found") ? 404 : 400;
      return NextResponse.json(
        { error: result.message || "Failed to delete player." },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      { message: result.message || "Player deleted successfully." },
      { status: 200 }
    ); // o 204 No Content
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API ADMIN_PLAYERS DELETE] Error deleting player ID ${playerIdStr}:`,
      errorMessage
    );
    if (errorMessage.includes("still referenced")) {
      // Errore da FK constraint
      return NextResponse.json({ error: errorMessage }, { status: 409 }); // Conflict
    }
    return NextResponse.json(
      { error: `Failed to delete player: ${errorMessage}` },
      { status: 500 }
    );
  }
}
