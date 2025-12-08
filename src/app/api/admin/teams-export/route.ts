import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { getLeagueRostersForCsvExport } from "@/lib/db/services/auction-league.service";

// Funzione helper per ottenere il nome della lega
const getLeagueName = async (leagueId: number): Promise<string> => {
  try {
    const result = await db.execute({
      sql: "SELECT name FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = result.rows[0] as unknown as { name: string } | undefined;
    return league?.name || "unknown-league";
  } catch (error) {
    console.error(`Error fetching league name for ID ${leagueId}:`, error);
    return "unknown-league";
  }
};

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user || user.publicMetadata?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leagueIdStr = searchParams.get("leagueId");
    const format = searchParams.get("format") || "csv"; // 'csv', 'excel', 'custom'

    if (!leagueIdStr) {
      return NextResponse.json(
        { error: "League ID is required" },
        { status: 400 }
      );
    }
    const leagueId = parseInt(leagueIdStr, 10);
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid League ID" }, { status: 400 });
    }

    const leagueName = await getLeagueName(leagueId);
    const sanitizedLeagueName = leagueName.replace(/[^a-zA-Z0-9]/g, "-");
    const fileName = `export-${sanitizedLeagueName}-L${leagueId}-${Date.now()}`;

    // Recupera i dati nel formato ["NomeSquadra,IDGiocatore,Prezzo",...]
    const csvRows = await getLeagueRostersForCsvExport(leagueId);

    if (csvRows.length === 0) {
      return NextResponse.json(
        { error: "No team data found for this league" },
        { status: 404 }
      );
    }

    if (format === "excel") {
      // Dynamic import di xlsx - caricato solo quando serve export Excel
      const xlsx = await import("xlsx");

      // Converte le righe CSV in un formato adatto per xlsx
      const dataForSheet = csvRows
        .filter((row) => row !== "$,$,$") // Escludi i separatori
        .map((row) => {
          const [teamName, playerId, price] = row.split(",");
          return {
            "Nome Squadra": teamName,
            "ID Giocatore": parseInt(playerId, 10),
            Prezzo: parseInt(price, 10),
          };
        });

      const worksheet = xlsx.utils.json_to_sheet(dataForSheet);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Rose");

      // Imposta larghezza colonne
      worksheet["!cols"] = [
        { wch: 25 }, // Nome Squadra
        { wch: 15 }, // ID Giocatore
        { wch: 10 }, // Prezzo
      ];

      const buf = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
        },
      });
    } else if (format === "custom") {
      // Formato personalizzato: NomeSquadraIDGiocatorePrezzo
      const customFormatContent = csvRows
        .map((row) => {
          if (row === "$,$,$") return "$"; // Separatore corretto
          const [teamName, playerId, price] = row.split(",");
          return `${teamName.replace(/\s/g, "")}${playerId}${price}`;
        })
        .join("\n");

      return new NextResponse(customFormatContent, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}.txt"`,
        },
      });
    } else {
      // Default to CSV senza header
      const csvContent = csvRows.join("\n");

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}.csv"`,
        },
      });
    }
  } catch (error) {
    console.error("Error exporting teams:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
