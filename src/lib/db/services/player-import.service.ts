// src/lib/db/services/player-import.service.ts v.2.0 (Async Turso Migration)
// Servizio per importare e processare dati dei giocatori da file Excel.
// Il parsing è isolato e validato dall'adapter in src/lib/import.
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

  // Array per raccogliere tutti gli ID importati dal file Excel
  const importedPlayerIds: number[] = [];

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

    // In replace mode lo svuotamento avviene PRIMA dell'import, così il
    // catalogo viene ricostruito da zero. Niente transazione esplicita:
    const validation = validateAndNormalizePlayerImportRows(jsonDataObjects);
    if (validation.errors.length > 0) {
      result.processedRows = jsonDataObjects.length;
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
    // su libsql una transaction('write') apre una connessione separata che
    // su DB file:memory non vede i dati della connessione principale
    // (e su Turso remoto l'isolamento non garantisce visibilità fuori dal
    // commit). Ogni DELETE è atomica di per sé.
    if (replaceMode) {
      try {
        console.log(
          `[SERVICE PLAYER_IMPORT] Replace mode: clearing all players and roster assignments before import.`
        );
        await db.execute({
          sql: `DELETE FROM player_assignments`,
          args: [],
        });
        const clearResult = await db.execute({
          sql: `DELETE FROM players`,
          args: [],
        });
        result.deletedOrphanPlayers = Number(clearResult.rowsAffected) || 0;
        result.clearedPlayers = result.deletedOrphanPlayers;
        console.log(
          `[SERVICE PLAYER_IMPORT] Replace mode: cleared ${result.clearedPlayers} players and all roster assignments.`
        );
      } catch (cleanupError) {
        console.error(
          "[SERVICE PLAYER_IMPORT] Error during replace cleanup:",
          cleanupError
        );
        result.errors.push(
          `Replace cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : "Unknown error"}`
        );
        return result;
      }
    }

    // Process all players in batches
    const BATCH_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < validation.rows.length; i += BATCH_SIZE) {
      chunks.push(validation.rows.slice(i, i + BATCH_SIZE));
    }

    console.log(
      `[SERVICE PLAYER_IMPORT] Processing ${jsonDataObjects.length} players in ${chunks.length} batches of size ${BATCH_SIZE}.`
    );

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const batchStatements = [];
      for (const playerData of chunk) {
        result.processedRows++;
        importedPlayerIds.push(playerData.id);
        const now = Math.floor(Date.now() / 1000);

        batchStatements.push({
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
            now, // Extra arg for updated_at in ON CONFLICT
          ],
        });
      }

      if (batchStatements.length > 0) {
        try {
          await db.batch(batchStatements, "write");
          result.successfullyUpsertedRows += batchStatements.length;
          console.log(
            `[SERVICE PLAYER_IMPORT] Batch ${chunkIndex + 1}/${chunks.length} success. Upserted ${batchStatements.length} rows.`
          );
        } catch (batchError) {
          console.error(
            `[SERVICE PLAYER_IMPORT] Batch ${chunkIndex + 1}/${chunks.length} failed:`,
            batchError
          );
          result.failedDbOperationsRows += batchStatements.length;
          result.errors.push(
            `Batch ${chunkIndex + 1} failed: ${batchError instanceof Error ? batchError.message : "Unknown error"}`
          );
        }
      }
    }

    // Eliminazione dei giocatori "orfani" (update mode, mercato invernale):
    // elimina solo i giocatori non nel file che non sono assegnati a nessuna
    // rosa e non hanno aste attive (preserva le rose delle leghe attive).
    // In replace mode lo svuotamento è già avvenuto PRIMA dell'import.
    if (!replaceMode && importedPlayerIds.length > 0) {
      try {
        console.log(
          `[SERVICE PLAYER_IMPORT] Starting orphan cleanup. Imported ${importedPlayerIds.length} player IDs.`
        );

        // Crea placeholders per la query IN (...)
        const placeholders = importedPlayerIds.map(() => "?").join(",");

        // Query: elimina giocatori che:
        // 1. NON sono nella lista degli ID importati
        // 2. NON sono assegnati a nessuna rosa (player_assignments)
        // 3. NON hanno aste attive o in chiusura
        const deleteOrphansResult = await db.execute({
          sql: `
            DELETE FROM players
            WHERE id NOT IN (${placeholders})
              AND id NOT IN (SELECT DISTINCT player_id FROM player_assignments)
              AND id NOT IN (SELECT DISTINCT player_id FROM auctions WHERE status IN ('active', 'closing'))
          `,
          args: importedPlayerIds,
        });

        result.deletedOrphanPlayers =
          Number(deleteOrphansResult.rowsAffected) || 0;
        console.log(
          `[SERVICE PLAYER_IMPORT] Orphan cleanup completed. Deleted ${result.deletedOrphanPlayers} orphan players.`
        );
      } catch (cleanupError) {
        console.error(
          "[SERVICE PLAYER_IMPORT] Error during orphan cleanup:",
          cleanupError
        );
        result.errors.push(
          `Orphan cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : "Unknown error"}`
        );
      }
    }

    if (
      result.failedValidationRows === 0 &&
      result.failedDbOperationsRows === 0
    ) {
      result.success = true;
      result.message = replaceMode
        ? `Successfully replaced the player database with ${result.successfullyUpsertedRows} players from Excel (catalog cleared first).`
        : `Successfully processed ${result.successfullyUpsertedRows} players from Excel. Deleted ${result.deletedOrphanPlayers} orphan players.`;
    } else {
      result.success = false;
      result.message = `Processed ${jsonDataObjects.length} rows. Upserts: ${result.successfullyUpsertedRows}, Validation Failures: ${result.failedValidationRows}, DB Failures: ${result.failedDbOperationsRows}, Orphans Deleted: ${result.deletedOrphanPlayers}. Check errors.`;
    }
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
