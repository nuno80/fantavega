import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  importRostersToLeague,
  parseCsvContent,
  validateImportData,
  type PriceSource,
} from "@/lib/db/services/roster-import.service";

interface ImportRequestBody {
  leagueId: number;
  csvContent: string;
  dryRun?: boolean; // Se true, esegue solo validazione senza import
  priceSource?: PriceSource; // 'csv' o 'database'
}

export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione e ruolo admin
    const user = await currentUser();
    if (!user || user.publicMetadata?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const body: ImportRequestBody = await request.json();
    const { leagueId, csvContent, dryRun = false, priceSource = "csv" } = body;

    // Validazione input
    if (!leagueId || typeof leagueId !== "number") {
      return NextResponse.json(
        { error: "League ID è richiesto e deve essere un numero" },
        { status: 400 }
      );
    }

    if (!csvContent || typeof csvContent !== "string" || csvContent.trim() === "") {
      return NextResponse.json(
        { error: "Contenuto CSV è richiesto" },
        { status: 400 }
      );
    }

    console.log(
      `[API TEAMS-IMPORT] ${dryRun ? "Validazione" : "Import"} richiesto per lega ${leagueId} (priceSource: ${priceSource})`
    );

    // Step 1: Parse CSV
    const entries = parseCsvContent(csvContent);

    if (entries.length === 0) {
      return NextResponse.json(
        {
          success: false,
          errors: ["Nessuna entry valida trovata nel CSV"],
          warnings: [],
          summary: null,
        },
        { status: 400 }
      );
    }

    // Step 2: Validazione
    const validation = await validateImportData(leagueId, entries);

    // Se dryRun, restituisci solo i risultati della validazione
    if (dryRun) {
      return NextResponse.json({
        success: validation.isValid,
        dryRun: true,
        errors: validation.errors,
        warnings: validation.warnings,
        summary: validation.summary,
        preview: validation.validEntries.slice(0, 50), // Primi 50 per anteprima
      });
    }

    // Se validazione fallita, non procedere con l'import
    if (!validation.isValid) {
      return NextResponse.json(
        {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
          summary: null,
        },
        { status: 400 }
      );
    }

    // Step 3: Esegui import
    const result = await importRostersToLeague(leagueId, entries, priceSource);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          warnings: result.warnings,
          summary: null,
        },
        { status: 500 }
      );
    }

    // Successo
    return NextResponse.json({
      success: true,
      teamsImported: result.teamsImported,
      playersImported: result.playersImported,
      warnings: result.warnings,
      summary: result.summary,
    });
  } catch (error) {
    console.error("[API TEAMS-IMPORT] Errore:", error);
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json(
      { error: `Errore interno del server: ${errorMessage}` },
      { status: 500 }
    );
  }
}
