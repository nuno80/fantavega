// API per eliminazione diretta lega via SQLite (bypass React hooks)
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

interface League {
  id: number;
  name: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    // Verifica autenticazione admin
    const user = await currentUser();
    if (!user?.publicMetadata?.role || user.publicMetadata.role !== "admin") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const { "league-id": leagueIdParam } = await params;
    const leagueId = parseInt(leagueIdParam);
    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Verifica che la lega esista
    const league = db
      .prepare("SELECT id, name FROM auction_leagues WHERE id = ?")
      .get(leagueId) as League | undefined;
    if (!league) {
      return NextResponse.json({ error: "Lega non trovata" }, { status: 404 });
    }

    // Eliminazione diretta via SQLite (cascade delete)
    const deleteResult = db
      .prepare("DELETE FROM auction_leagues WHERE id = ?")
      .run(leagueId);

    if (deleteResult.changes > 0) {
      console.log(
        `[FORCE_DELETE] Admin ${user.id} deleted league ${leagueId} (${league.name})`
      );
      return NextResponse.json({
        success: true,
        message: `Lega "${league.name}" eliminata con successo`,
      });
    } else {
      return NextResponse.json(
        { error: "Nessuna lega eliminata" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[FORCE_DELETE] Error:", error);
    return NextResponse.json(
      {
        error: "Errore interno del server",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
