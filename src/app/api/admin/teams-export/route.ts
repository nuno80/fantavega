import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";
import * as XLSX from "xlsx";

import { getLeagueRostersForExport } from "@/lib/db/services/auction-league.service";

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
      return NextResponse.json({ error: "ID lega richiesto" }, { status: 400 });
    }

    const leagueId = parseInt(leagueIdParam, 10);
    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // 1. Recupera i dati strutturati dal servizio
    const exportData = await getLeagueRostersForExport(leagueId);

    // 2. Validazione corretta dei dati ricevuti
    if (!exportData || !exportData.teams || exportData.teams.length === 0) {
      return NextResponse.json(
        { error: "Nessun dato o squadra da esportare per questa lega." },
        { status: 404 }
      );
    }

    const { league, exportInfo, teams } = exportData;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const headers = new Headers();
    let fileName: string;

    // 3. Switch corretto per i formati
    switch (format) {
      case "xlsx":
        const wb = XLSX.utils.book_new();
        const summaryData = [
          ["Nome Lega", league.name],
          ["Data Export", exportInfo.exportDate],
          ["Squadre Totali", exportInfo.totalTeams],
          ["Giocatori Totali", exportInfo.totalPlayers],
        ];
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, "Riepilogo");

        teams.forEach((team) => {
          const teamHeader = [
            "ID Giocatore",
            "Nome Giocatore",
            "Ruolo",
            "Squadra",
            "FVM",
            "Prezzo Acquisto",
          ];
          const playersData = team.players.map((p) => [
            p.player_id,
            p.player_name,
            p.role,
            p.team,
            p.fvm || "N/A",
            p.purchase_price,
          ]);
          const teamWs = XLSX.utils.aoa_to_sheet([teamHeader, ...playersData]);
          const sheetName = team.teamName
            .substring(0, 31)
            .replace(/[\\/?*[\]]/g, "");
          XLSX.utils.book_append_sheet(wb, teamWs, sheetName);
        });

        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        fileName = `fantavega_rosters_${league.id}_${timestamp}.xlsx`;
        headers.set(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        headers.set(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );
        return new NextResponse(Buffer.from(buf), { status: 200, headers });

      case "custom":
        fileName = `fantavega_rosters_${league.id}_${timestamp}.json`;
        headers.set(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );
        return NextResponse.json(exportData, { status: 200, headers });

      case "csv":
      default:
        const csvRows: string[] = [];

        teams.forEach((team) => {
          // Aggiungi il separatore prima di ogni squadra
          csvRows.push("$,$,$");

          if (team.players.length > 0) {
            team.players.forEach((player) => {
              const row = [
                team.teamName,
                player.player_id,
                player.purchase_price,
              ].join(",");
              csvRows.push(row);
            });
          } else {
            // Se una squadra non ha giocatori, aggiungi una riga con solo il nome del team
            csvRows.push(`${team.teamName},,`);
          }
        });

        fileName = `fantavega_rosters_${league.id}_${timestamp}.csv`;
        headers.set("Content-Type", "text/csv; charset=utf-8");
        headers.set(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );
        return new NextResponse(csvRows.join("\n"), { status: 200, headers });
    }
  } catch (error) {
    console.error("Errore durante l'esportazione delle squadre:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Errore interno del server";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
