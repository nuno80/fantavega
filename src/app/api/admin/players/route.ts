// src/app/api/admin/players/route.ts v.1.0
// API Route per creare un nuovo giocatore (solo Admin).
import { type NextRequest, NextResponse } from "next/server";

// Adatta il percorso se necessario
import { currentUser } from "@clerk/nextjs/server";

import {
  type CreatePlayerData,
  createPlayer,
} from "@/lib/db/services/player.service";

export async function POST(request: NextRequest) {
  console.log("[API ADMIN_PLAYERS POST] Request to create player.");
  try {
    const adminUser = await currentUser();
    if (!adminUser || adminUser.publicMetadata?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CreatePlayerData;

    // Validazione di base dei dati ricevuti (può essere più estesa con Zod, ecc.)
    if (!body.id || typeof body.id !== "number" || body.id <= 0) {
      return NextResponse.json(
        { error: "Player ID is required and must be a positive number." },
        { status: 400 }
      );
    }
    if (
      !body.name ||
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Player name is required." },
        { status: 400 }
      );
    }
    if (!body.role || !["P", "D", "C", "A"].includes(body.role)) {
      return NextResponse.json(
        { error: "Valid player role (P, D, C, A) is required." },
        { status: 400 }
      );
    }
    if (
      !body.team ||
      typeof body.team !== "string" ||
      body.team.trim() === ""
    ) {
      return NextResponse.json(
        { error: "Player team is required." },
        { status: 400 }
      );
    }
    if (
      typeof body.initial_quotation !== "number" ||
      typeof body.current_quotation !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Initial and current quotations are required and must be numbers.",
        },
        { status: 400 }
      );
    }
    // Aggiungere altre validazioni se necessario per i campi opzionali

    const newPlayer = createPlayer(body); // La funzione di servizio ora lancia eccezioni in caso di errore DB

    return NextResponse.json(newPlayer, { status: 201 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      "[API ADMIN_PLAYERS POST] Error creating player:",
      errorMessage
    );
    if (errorMessage.includes("already exists")) {
      return NextResponse.json({ error: errorMessage }, { status: 409 }); // Conflict
    }
    if (error instanceof SyntaxError) {
      // Errore nel parsing del JSON body
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: `Failed to create player: ${errorMessage}` },
      { status: 500 }
    );
  }
}
