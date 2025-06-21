// src/lib/db/services/player-import.service.ts v.1.1
// Servizio per importare e processare dati dei giocatori da file Excel.
// Assicurati che il percorso a db sia corretto
import * as XLSX from "xlsx";

import { db } from "@/lib/db";

// Interfaccia per rappresentare una riga mappata dal file Excel
interface PlayerExcelData {
  id: number;
  role: string;
  role_mantra: string | null;
  name: string;
  team: string;
  current_quotation: number;
  initial_quotation: number;
  current_quotation_mantra: number | null;
  initial_quotation_mantra: number | null;
  fvm: number | null;
  fvm_mantra: number | null;
  // Non includiamo campi calcolati come 'Diff.' o 'Diff.M' qui
  // né campi del DB come created_at, updated_at, last_updated_from_source
}

// Funzione helper per sanificare i nomi dei giocatori
const sanitizePlayerName = (name: string): string => {
  if (!name) return "";
  let sanitized = name.trim();
  sanitized = sanitized
    .replace(/[àáâãäå]/gi, "a") // Aggiunto /g per global replace e /i per case-insensitive
    .replace(/[èéêë]/gi, "e")
    .replace(/[ìíîï]/gi, "i")
    .replace(/[òóôõöø]/gi, "o")
    .replace(/[ùúûü]/gi, "u")
    .replace(/[ýÿ]/gi, "y")
    .replace(/[ñ]/gi, "n")
    .replace(/[ç]/gi, "c");
  // Considera se rimuovere o gestire apostrofi, anche se i prepared statements li gestiscono
  // sanitized = sanitized.replace(/'/g, '');
  return sanitized;
};

// Interfaccia per il risultato dell'importazione
export interface PlayerImportResult {
  success: boolean;
  message: string;
  totalRowsInSheet: number;
  processedRows: number; // Righe dati lette dopo gli header
  successfullyUpsertedRows: number; // Righe effettivamente inserite/aggiornate nel DB
  failedValidationRows: number;
  failedDbOperationsRows: number;
  errors: string[];
}

export const processPlayersExcel = async (
  fileBuffer: Buffer
): Promise<PlayerImportResult> => {
  console.log("[SERVICE PLAYER_IMPORT] Starting Excel processing.");
  const result: PlayerImportResult = {
    success: false,
    message: "",
    totalRowsInSheet: 0,
    processedRows: 0,
    successfullyUpsertedRows: 0,
    failedValidationRows: 0,
    failedDbOperationsRows: 0,
    errors: [],
  };

  try {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = "Tutti";
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      result.message = `Sheet "${sheetName}" not found in the Excel file.`;
      result.errors.push(result.message);
      console.error(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }

    console.log(`[SERVICE PLAYER_IMPORT] Parsing sheet "${sheetName}"...`);
    const sheetDataAsArray: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false, // Tenta di convertire i tipi, ma verificheremo comunque
      defval: null,
    });

    result.totalRowsInSheet = sheetDataAsArray.length;

    if (sheetDataAsArray.length < 3) {
      // Riga Titolo + Riga Intestazioni + Almeno 1 riga dati
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
        const rowObject: { [key: string]: any } = {};
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
      .filter((row) => row !== null) as any[];

    if (jsonDataObjects.length === 0) {
      result.message = `No valid data objects could be constructed from sheet "${sheetName}".`;
      result.errors.push(result.message);
      console.warn(`[SERVICE PLAYER_IMPORT] ${result.message}`);
      return result;
    }
    console.log(
      `[SERVICE PLAYER_IMPORT] Successfully parsed ${jsonDataObjects.length} data rows into objects.`
    );

    const upsertPlayerStmt = db.prepare(`
      INSERT INTO players (
        id, role, role_mantra, name, team, 
        current_quotation, initial_quotation, 
        current_quotation_mantra, initial_quotation_mantra, 
        fvm, fvm_mantra, 
        last_updated_from_source, created_at, updated_at
      ) VALUES (
        @id, @role, @role_mantra, @name, @team, 
        @current_quotation, @initial_quotation,
        @current_quotation_mantra, @initial_quotation_mantra,
        @fvm, @fvm_mantra,
        @last_updated_from_source, strftime('%s','now'), strftime('%s','now')
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
        last_updated_from_source = excluded.last_updated_from_source,
        updated_at = strftime('%s','now')
    `);

    const processDbRow = db.transaction(
      (playerDataToUpsert: PlayerExcelData) => {
        try {
          upsertPlayerStmt.run({
            ...playerDataToUpsert,
            last_updated_from_source: Math.floor(Date.now() / 1000),
          });
          result.successfullyUpsertedRows++;
        } catch (dbError: any) {
          console.error(
            `[SERVICE PLAYER_IMPORT] DB Error for player ID ${playerDataToUpsert.id}: ${dbError.message}`
          );
          result.errors.push(
            `DB Error for player ID ${playerDataToUpsert.id} (${playerDataToUpsert.name}): ${dbError.message}`
          );
          result.failedDbOperationsRows++;
        }
      }
    );

    for (const row of jsonDataObjects) {
      result.processedRows++;
      const excelRowNumber = result.processedRows + 2; // +2 per riga titolo e riga header

      const idVal = row["Id"];
      const roleVal = row["R"];
      const nameVal = row["Nome"];
      const teamVal = row["Squadra"];
      const qtAVal = row["Qt.A"];
      const qtIVal = row["Qt.I"];

      const id = parseInt(idVal, 10);
      if (isNaN(id) || id <= 0) {
        result.errors.push(
          `Row ${excelRowNumber}: Invalid or missing 'Id' ('${idVal}')`
        );
        result.failedValidationRows++;
        continue;
      }

      const role = roleVal?.toString().toUpperCase();
      if (!role || !["P", "D", "C", "A"].includes(role)) {
        result.errors.push(
          `Row ${excelRowNumber} (ID ${id}): Invalid or missing 'R' (role) ('${roleVal}')`
        );
        result.failedValidationRows++;
        continue;
      }

      const name = nameVal?.toString();
      if (!name || name.trim() === "") {
        result.errors.push(`Row ${excelRowNumber} (ID ${id}): Missing 'Nome'`);
        result.failedValidationRows++;
        continue;
      }

      const team = teamVal?.toString();
      if (!team || team.trim() === "") {
        result.errors.push(
          `Row ${excelRowNumber} (ID ${id}): Missing 'Squadra'`
        );
        result.failedValidationRows++;
        continue;
      }

      const current_quotation = parseFloat(qtAVal);
      const initial_quotation = parseFloat(qtIVal);
      if (isNaN(current_quotation) || isNaN(initial_quotation)) {
        result.errors.push(
          `Row ${excelRowNumber} (ID ${id}): Invalid numeric value for 'Qt.A' ('${qtAVal}') or 'Qt.I' ('${qtIVal}')`
        );
        result.failedValidationRows++;
        continue;
      }

      // Funzione helper per parsare valori numerici opzionali o null
      const parseOptionalFloat = (value: any): number | null => {
        if (
          value === null ||
          value === undefined ||
          String(value).trim() === ""
        )
          return null;
        const num = parseFloat(String(value));
        return isNaN(num) ? null : num;
      };

      const playerData: PlayerExcelData = {
        id: id,
        role: role,
        role_mantra: row["RM"]?.toString().trim() || null,
        name: sanitizePlayerName(name),
        team: team.trim(),
        current_quotation: current_quotation,
        initial_quotation: initial_quotation,
        current_quotation_mantra: parseOptionalFloat(row["Qt.A M"]),
        initial_quotation_mantra: parseOptionalFloat(row["Qt.I M"]),
        fvm: parseOptionalFloat(row["FVM"]),
        fvm_mantra: parseOptionalFloat(row["FVM M"]),
      };

      processDbRow(playerData); // Esegue l'UPSERT dentro la sua transazione
    }

    if (
      result.failedValidationRows === 0 &&
      result.failedDbOperationsRows === 0
    ) {
      result.success = true;
      result.message = `Successfully processed ${result.successfullyUpsertedRows} players from Excel.`;
    } else {
      result.success = false;
      result.message = `Processed ${jsonDataObjects.length} rows. Successful Upserts: ${result.successfullyUpsertedRows}, Validation Failures: ${result.failedValidationRows}, DB Operation Failures: ${result.failedDbOperationsRows}. Check errors array.`;
    }
  } catch (error: any) {
    console.error(
      "[SERVICE PLAYER_IMPORT] General error processing Excel file:",
      error
    );
    result.message = "Failed to process Excel file due to a critical error.";
    result.errors.push(
      error.message || "Unknown error during Excel processing."
    );
    result.success = false; // Assicura che success sia false in caso di eccezione generale
  }

  console.log(
    `[SERVICE PLAYER_IMPORT] Processing finished. Success: ${result.success}, Message: ${result.message}`
  );
  return result;
};
