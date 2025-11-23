// API per eliminazione diretta lega via Turso (async)
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
    const leagueResult = await db.execute({
      sql: "SELECT id, name FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as League | undefined;


    if (!league) {
      return NextResponse.json({ error: "Lega non trovata" }, { status: 404 });
    }

    // Eliminazione diretta via Turso (cascade delete)
    const deleteResult = await db.execute({
      sql: "DELETE FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });

    if (deleteResult.rowsAffected > 0) {
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
