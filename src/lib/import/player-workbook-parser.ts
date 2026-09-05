import {
  ExcelArchivePolicyError,
  MAX_EXCEL_ARCHIVE_ENTRIES,
  MAX_EXCEL_UNCOMPRESSED_BYTES,
  preflightXlsxArchive,
} from "@/lib/import/excel-archive-policy";
import { MAX_EXCEL_UPLOAD_BYTES } from "@/lib/import/excel-upload-policy";
import {
  XlsxWorkerError,
  readXlsxRowsInWorker,
} from "@/lib/import/xlsx-worker-reader";

export const PLAYER_WORKBOOK_LIMITS = {
  maxArchiveEntries: MAX_EXCEL_ARCHIVE_ENTRIES,
  maxUncompressedArchiveBytes: MAX_EXCEL_UNCOMPRESSED_BYTES,
  maxSheets: 6, // listone ufficiale: Tutti, Portieri, Difensori, Centrocampisti, Attaccanti, Ceduti
  maxRowsPerSheet: 2_000,
  maxParseDurationMs: 2_000,
  maxColumnsPerSheet: 32,
  maxCellsPerWorkbook: 50_000,
  maxCellTextLength: 4_096,
  maxFormulaLength: 8_192,
} as const;

export class WorkbookPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WorkbookPolicyError";
  }
}

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const hasPrefix = (buffer: Buffer, prefix: Buffer) =>
  buffer.length >= prefix.length &&
  buffer.subarray(0, prefix.length).equals(prefix);

export interface ParsedPlayerWorkbook {
  sheetName: string;
  rows: unknown[][];
  metrics: {
    sheetCount: number;
    rowCount: number;
    columnCount: number;
    cellCount: number;
  };
}

const POLICY_MESSAGES: Record<string, string> = {
  INVALID_WORKBOOK: "The uploaded Excel workbook is malformed or corrupted.",
  MISSING_SHEET: 'Sheet "Tutti" not found in the Excel file.',
  TOO_MANY_SHEETS: `Workbook exceeds the ${PLAYER_WORKBOOK_LIMITS.maxSheets}-sheet limit.`,
  TOO_MANY_ROWS: `Sheet exceeds the ${PLAYER_WORKBOOK_LIMITS.maxRowsPerSheet}-row limit.`,
  TOO_MANY_COLUMNS: `Sheet exceeds the ${PLAYER_WORKBOOK_LIMITS.maxColumnsPerSheet}-column limit.`,
  TOO_MANY_CELLS: `Workbook exceeds the ${PLAYER_WORKBOOK_LIMITS.maxCellsPerWorkbook}-cell limit.`,
  CELL_TEXT_TOO_LONG: `Workbook contains a cell exceeding the ${PLAYER_WORKBOOK_LIMITS.maxCellTextLength}-character limit.`,
  FORMULA_TOO_LONG: `Workbook contains a formula exceeding the ${PLAYER_WORKBOOK_LIMITS.maxFormulaLength}-character limit.`,
  PARSE_TIMEOUT: "Excel workbook parsing exceeded the allowed duration.",
  PARSER_BUSY: "Excel workbook parser is busy. Try again later.",
};

export async function parsePlayerWorkbook(
  fileBuffer: Buffer
): Promise<ParsedPlayerWorkbook> {
  if (fileBuffer.length > MAX_EXCEL_UPLOAD_BYTES) {
    throw new WorkbookPolicyError(
      "FILE_TOO_LARGE",
      "File too large. Maximum allowed size is 10 MiB."
    );
  }
  if (
    !hasPrefix(fileBuffer, ZIP_SIGNATURE) &&
    !hasPrefix(fileBuffer, CFB_SIGNATURE)
  ) {
    throw new WorkbookPolicyError(
      "INVALID_WORKBOOK",
      "The uploaded file is not a valid Excel workbook."
    );
  }
  try {
    preflightXlsxArchive(fileBuffer);
  } catch (error) {
    if (error instanceof ExcelArchivePolicyError)
      throw new WorkbookPolicyError(error.code, error.message);
    throw new WorkbookPolicyError(
      "INVALID_WORKBOOK",
      "The uploaded Excel workbook has an invalid archive structure."
    );
  }
  try {
    return await readXlsxRowsInWorker(fileBuffer, {
      limits: PLAYER_WORKBOOK_LIMITS,
      timeoutMs: PLAYER_WORKBOOK_LIMITS.maxParseDurationMs,
      requiredSheetName: "Tutti",
    });
  } catch (error) {
    const code =
      error instanceof XlsxWorkerError ? error.code : "INVALID_WORKBOOK";
    throw new WorkbookPolicyError(
      code,
      POLICY_MESSAGES[code] ?? POLICY_MESSAGES.INVALID_WORKBOOK
    );
  }
}
