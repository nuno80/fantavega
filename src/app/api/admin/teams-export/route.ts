import { NextRequest, NextResponse } from "next/server";
import * as XLSX from 'xlsx';

import { currentUser } from "@clerk/nextjs/server";

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

    // Recupera i dati delle squadre nel formato richiesto
    const exportData = await getLeagueRostersForExport(leagueId, format as 'csv' | 'excel' | 'json');

    if ((exportData.csvRows?.length === 0 && !exportData.jsonData) || 
        (exportData.metadata.totalTeams === 0)) {
      return NextResponse.json(
        { error: "Nessun dato trovato per questa lega" },
        { status: 404 }
      );
    }

    // Genera il contenuto basato sul formato richiesto
    let content: string | Buffer;
    let contentType: string;
    let fileName: string;

    switch (format) {
      case "excel":
        // Genera vero file Excel con SheetJS
        const workbook = XLSX.utils.book_new();
        
        // Foglio principale con tutti i dati
        const mainSheetData = [];
        mainSheetData.push(['# Esportazione Rose - ' + exportData.metadata.leagueName]);
        mainSheetData.push(['# Data Export: ' + exportData.metadata.exportDate]);
        mainSheetData.push(['# Squadre: ' + exportData.metadata.totalTeams + ', Giocatori: ' + exportData.metadata.totalPlayers]);
        mainSheetData.push([]);
        mainSheetData.push(['Nome Squadra', 'ID Giocatore', 'Nome Giocatore', 'Ruolo', 'Squadra Reale', 'FVM', 'Costo Acquisto']);
        
        // Aggiungi dati dalle righe CSV (saltando header e commenti)
        if (exportData.csvRows) {
          exportData.csvRows.forEach(row => {
            if (!row.startsWith('#') && row.trim() !== '' && row !== '$,$,$') {
              const parts = row.split(',');
              if (parts.length >= 7) {
                mainSheetData.push(parts);
              }
            }
          });
        }
        
        const mainSheet = XLSX.utils.aoa_to_sheet(mainSheetData);
        XLSX.utils.book_append_sheet(workbook, mainSheet, "Rose Complete");
        
        // Aggiungi foglio riassuntivo se abbiamo dati JSON
        if (exportData.jsonData) {
          const summaryData = [
            ['Nome Squadra', 'Manager', 'Budget Residuo', 'Budget Speso', 'Giocatori', 'Valore Totale'],
          ];
          
          exportData.jsonData.teams.forEach((team: any) => {
            summaryData.push([
              team.teamName,
              team.managerUsername || '',
              team.currentBudget,
              team.spentBudget,
              team.totalPlayers,
              team.totalValue
            ]);
          });
          
          const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
          XLSX.utils.book_append_sheet(workbook, summarySheet, "Riassunto Squadre");
        }
        
        content = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        fileName = `squadre_${exportData.metadata.leagueName.replace(/[^a-zA-Z0-9]/g, '_')}_${leagueId}.xlsx`;
        break;

      case "custom":
        // Formato JSON dettagliato
        if (!exportData.jsonData) {
          const jsonExport = await getLeagueRostersForExport(leagueId, 'json');
          content = JSON.stringify(jsonExport.jsonData, null, 2);
        } else {
          content = JSON.stringify(exportData.jsonData, null, 2);
        }
        contentType = "application/json";
        fileName = `squadre_${exportData.metadata.leagueName.replace(/[^a-zA-Z0-9]/g, '_')}_${leagueId}.json`;
        break;

      case "csv":
      default:
        content = exportData.csvRows?.join("\n") || '';
        contentType = "text/csv; charset=utf-8";
        fileName = `squadre_${exportData.metadata.leagueName.replace(/[^a-zA-Z0-9]/g, '_')}_${leagueId}.csv`;
        break;
    }

    // Crea la risposta con il file
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-cache",
      "X-Export-Metadata": JSON.stringify(exportData.metadata),
    };

    // Aggiungi header specifici per i diversi formati
    if (format === "excel") {
      headers["Content-Length"] = (content as Buffer).length.toString();
    } else {
      headers["Content-Length"] = Buffer.byteLength(content as string, 'utf8').toString();
    }

    const response = new NextResponse(content, {
      status: 200,
      headers,
    });

    console.log(`[TEAMS_EXPORT] Successfully exported ${format} for league ${leagueId}: ${fileName}`);
    return response;
  } catch (error) {
    console.error("Errore durante l'esportazione delle squadre:", error);
    return NextResponse.json(
      { error: "Errore interno del server" },
      { status: 500 }
    );
  }
}
