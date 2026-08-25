// src/lib/db/services/player-import.service.ts v.2.0 (Async Turso Migration)
// Servizio per importare e processare dati dei giocatori da file Excel.
// Il parsing è isolato e validato dall'adapter in src/lib/import.
import type { InStatement } from "@libsql/client";

import { db } from "@/lib/db";
import { validateAndNormalizePlayerImportRows } from "@/lib/import/player-row-validation";
import {
  WorkbookPolicyError,
  parsePlayerWorkbook,
} from "@/lib/import/player-workbook-parser";

// Interfaccia per il risultato dell'importazione
export interface PlayerImportResult {
  success: boolean;
  message: string;
  totalRowsInSheet: number;
  processedRows: number;
  successfullyUpsertedRows: number;
  failedValidationRows: number;
  failedDbOperationsRows: number;
  deletedOrphanPlayers: number; // Giocatori rimossi perché non nel file e non assegnati
  clearedPlayers?: number; // (replaceMode) Giocatori rimossi dallo svuotamento iniziale
  errors: string[];
}

export const processPlayersExcel = async (
  fileBuffer: Buffer,
  options: { replaceMode?: boolean } = {}
): Promise<PlayerImportResult> => {
  const { replaceMode = false } = options;
  console.log(
    `[SERVICE PLAYER_IMPORT] Starting Excel processing (replaceMode: ${replaceMode}).`
  );
  const result: PlayerImportResult = {
    success: false,
    message: "",
    totalRowsInSheet: 0,
    processedRows: 0,
    successfullyUpsertedRows: 0,
    failedValidationRows: 0,
    failedDbOperationsRows: 0,
    deletedOrphanPlayers: 0,
    errors: [],
  };

  try {
    const parsedWorkbook = await parsePlayerWorkbook(fileBuffer);
    const { sheetName } = parsedWorkbook;
    console.log(`[SERVICE PLAYER_IMPORT] Parsing sheet "${sheetName}"...`);
    const sheetDataAsArray = parsedWorkbook.rows;

    result.totalRowsInSheet = sheetDataAsArray.length;

    if (sheetDataAsArray.length < 3) {
      result.message = `Sheet "${sheetName}" does not contain enough rows for headers and data (minimum 3 rows required). Found ${sheetDataAsArray.length} rows.`;
      result.errors.push(result.message);
      console.warn(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }

    const headersFromSheet = sheetDataAsArray[1] as string[];
    if (
      !headersFromSheet ||
      headersFromSheet.length === 0 ||
      headersFromSheet.every((h) => h === null)
    ) {
      result.message = `Could not find valid headers in the second row of sheet "${sheetName}".`;
      result.errors.push(result.message);
      console.warn(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }
    console.log(
      `[SERVICE PLAYER_IMPORT] Headers found: ${headersFromSheet.join(", ")}`
    );

    const dataRowsOnly = sheetDataAsArray.slice(2);
    if (dataRowsOnly.length === 0) {
      result.message = `No data rows found in sheet "${sheetName}" (expected data to start from row 3).`;
      result.errors.push(result.message);
      console.warn(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }

    const jsonDataObjects = dataRowsOnly
      .map((rowArray, rowIndex) => {
        const rowObject: Record<string, unknown> = {};
        if (
          !rowArray ||
          rowArray.length === 0 ||
          rowArray.every((cell) => cell === null)
        ) {
          console.warn(
            `[SERVICE PLAYER_IMPORT] Skipping empty data row at Excel row index ${rowIndex + 3}`
          );
          return null;
        }
        headersFromSheet.forEach((header, index) => {
          if (header) {
            rowObject[header.trim()] = rowArray[index];
          }
        });
        return rowObject;
      })
      .filter((row) => row !== null) as Array<Record<string, unknown>>;

    if (jsonDataObjects.length === 0) {
      result.message = `No valid data objects could be constructed from sheet "${sheetName}".`;
      result.errors.push(result.message);
      console.warn(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }
    console.log(
      `[SERVICE PLAYER_IMPORT] Successfully parsed ${jsonDataObjects.length} data rows into objects.`
    );

    // Validazione completa PRIMA di ogni scrittura: nessuna delete/insert
    // può partire finché l'intero workbook non è normalizzato e valido.
    const validation = validateAndNormalizePlayerImportRows(jsonDataObjects);
    result.processedRows = jsonDataObjects.length;
    if (validation.errors.length > 0) {
      result.failedValidationRows = validation.errors.length;
      result.errors.push(...validation.errors);
      result.message =
        `Rejected ${jsonDataObjects.length} rows before import: ` +
        `${validation.errors.length} validation failure(s).`;
      console.warn("[SERVICE PLAYER_IMPORT] Workbook rows rejected", {
        validationFailures: validation.errors.length,
      });
      return result;
    }

    // Tutte le mutazioni (svuotamento, upsert, cleanup orfani) avvengono in
    // UN solo batch atomico "write": su libsql/Turso il batch esegue
    // BEGIN IMMEDIATE e fa rollback dell'intero batch se una qualsiasi
    // istruzione fallisce. Così un errore nell'ultima riga non lascia mai
    // il catalogo o le rose in uno stato parziale.
    const statements: InStatement[] = [];
    const importedPlayerIds = validation.rows.map((row) => row.id);
    const now = Math.floor(Date.now() / 1000);

    if (replaceMode) {
      // L'ordine rispetta le FK: prima le assegnazioni, poi i giocatori.
      statements.push({ sql: "DELETE FROM player_assignments", args: [] });
      statements.push({ sql: "DELETE FROM players", args: [] });
    }

    for (const playerData of validation.rows) {
      statements.push({
        sql: `
          INSERT INTO players (
            id, role, role_mantra, name, team,
            current_quotation, initial_quotation,
            current_quotation_mantra, initial_quotation_mantra,
            fvm, fvm_mantra, photo_url,
            last_updated_from_source, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            role = excluded.role,
            role_mantra = excluded.role_mantra,
            name = excluded.name,
            team = excluded.team,
            current_quotation = excluded.current_quotation,
            initial_quotation = excluded.initial_quotation,
            current_quotation_mantra = excluded.current_quotation_mantra,
            initial_quotation_mantra = excluded.initial_quotation_mantra,
            fvm = excluded.fvm,
            fvm_mantra = excluded.fvm_mantra,
            photo_url = excluded.photo_url,
            last_updated_from_source = excluded.last_updated_from_source,
            updated_at = ?
        `,
        args: [
          playerData.id,
          playerData.role,
          playerData.role_mantra,
          playerData.name,
          playerData.team,
          playerData.current_quotation,
          playerData.initial_quotation,
          playerData.current_quotation_mantra,
          playerData.initial_quotation_mantra,
          playerData.fvm,
          playerData.fvm_mantra,
          playerData.photo_url || null,
          now,
          now,
          now,
          now, // updated_at in ON CONFLICT
        ],
      });
    }

    // Cleanup orfani (update mode, mercato invernale): elimina solo i
    // giocatori non nel file, non in rosa e senza aste attive. In replace
    // mode lo svuotamento è già incluso sopra. Anche questo DELETE è nello
    // stesso batch atomico.
    if (!replaceMode && importedPlayerIds.length > 0) {
      const placeholders = importedPlayerIds.map(() => "?").join(",");
      statements.push({
        sql: `
          DELETE FROM players
          WHERE id NOT IN (${placeholders})
            AND id NOT IN (SELECT DISTINCT player_id FROM player_assignments)
            AND id NOT IN (SELECT DISTINCT player_id FROM auctions WHERE status IN ('active', 'closing'))
        `,
        args: importedPlayerIds,
      });
    }

    const resultSets = await db.batch(statements, "write");
    result.successfullyUpsertedRows = validation.rows.length;

    if (replaceMode) {
      const clearResult = resultSets[1];
      result.deletedOrphanPlayers = Number(clearResult?.rowsAffected) || 0;
      result.clearedPlayers = result.deletedOrphanPlayers;
    } else if (importedPlayerIds.length > 0) {
      const orphanResult = resultSets[resultSets.length - 1];
      result.deletedOrphanPlayers = Number(orphanResult?.rowsAffected) || 0;
    }

    result.success = true;
    result.message = replaceMode
      ? `Successfully replaced the player database with ${result.successfullyUpsertedRows} players from Excel (catalog cleared first).`
      : `Successfully processed ${result.successfullyUpsertedRows} players from Excel. Deleted ${result.deletedOrphanPlayers} orphan players.`;
  } catch (error: unknown) {
    console.error("[SERVICE PLAYER_IMPORT] Workbook rejected", {
      errorType: error instanceof Error ? error.name : "unknown",
      policyCode: error instanceof WorkbookPolicyError ? error.code : undefined,
    });
    result.message = "Failed to process Excel file due to a critical error.";
    result.errors.push(
      error instanceof WorkbookPolicyError
        ? error.message
        : "Unexpected error during Excel processing."
    );
    result.success = false;
  }

  console.log(
    `[SERVICE PLAYER_IMPORT] Processing finished (replaceMode: ${replaceMode}). Success: ${result.success}, Message: ${result.message}`
  );
  return result;
};
