import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { getLeagueRostersForCsvExport } from "@/lib/db/services/auction-league.service";

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const userRole = (user.publicMetadata?.role as string) || "user";
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const leagueIdParam = searchParams.get("leagueId");
    const format = searchParams.get("format") || "csv";

    if (!leagueIdParam) {
      return NextResponse.json(
        { error: "ID lega richiesto" },
        { status: 400 }
      );
    }

    const leagueId = parseInt(leagueIdParam, 10);
    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Recupera i dati delle squadre
    const csvRows = await getLeagueRostersForCsvExport(leagueId);

    if (csvRows.length === 0) {
      return NextResponse.json(
        { error: "Nessun dato trovato per questa lega" },
        { status: 404 }
      );
    }

    // Genera il contenuto basato sul formato richiesto
    let content: string;
    let contentType: string;
    let fileName: string;

    switch (format) {
      case "excel":
        // Per Excel, generiamo comunque CSV ma con estensione .xlsx
        // In futuro si potrebbe implementare un vero formato Excel
        content = csvRows.join("\n");
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        fileName = `squadre_lega_${leagueId}.xlsx`;
        break;
      
      case "custom":
        content = csvRows.join("\n");
        contentType = "text/plain";
        fileName = `squadre_lega_${leagueId}.txt`;
        break;
      
      case "csv":
      default:
        content = csvRows.join("\n");
        contentType = "text/csv";
        fileName = `squadre_lega_${leagueId}.csv`;
        break;
    }

    // Crea la risposta con il file
    const response = new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache",
      },
    });

    return response;
  } catch (error) {
    console.error("Errore durante l'esportazione delle squadre:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}