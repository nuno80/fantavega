// src/lib/import/parse-xlsx-workbook.ts
// Parsing Excel in-process (senza worker_threads).
//
// Perché: in produzione Next/Webpack compila `xlsx` dentro il bundle della
// route e sostituisce il path fisico con un id numerico interno del bundle.
// Il vecchio worker (eval: true) faceva `require(modulePath)` su quell'id e
// falliva sempre => ogni upload admin veniva rifiutato con INVALID_WORKBOOK.
// Il parse gira ora nello stesso processo della route, dove il modulo
// bundlato è raggiungibile con un import statico normale.
//
// I limiti (fogli/righe/celle/testo/formule) e la proiezione (sheet -> rows)
// sono gli stessi del worker: nessun cambiamento di contratto all'esterno.
import * as XLSX from "xlsx";

export interface XlsxWorkbookLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  maxCellsPerWorkbook: number;
  maxCellTextLength: number;
  maxFormulaLength: number;
}

export interface ProjectedWorkbook {
  sheetName: string;
  rows: unknown[][];
  metrics: {
    sheetCount: number;
    rowCount: number;
    columnCount: number;
    cellCount: number;
  };
}

export class XlsxWorkbookError extends Error {
  constructor(public readonly code: string) {
    super(
      code === "PARSE_TIMEOUT"
        ? "Excel workbook parsing exceeded the allowed duration."
        : code === "PARSER_BUSY"
          ? "Excel workbook parser is busy. Try again later."
          : "The uploaded Excel workbook was rejected."
    );
    this.name = "XlsxWorkbookError";
  }
}

export function parseXlsxWorkbookInProcess(
  fileBuffer: Buffer,
  options: {
    limits: XlsxWorkbookLimits;
    requiredSheetName: string;
    timeoutMs?: number;
  }
): Promise<ProjectedWorkbook> {
  const { limits, requiredSheetName } = options;
  return Promise.resolve().then(() => {
    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      sheetRows: limits.maxRowsPerSheet + 1,
      cellText: false,
      cellFormula: true,
      cellHTML: false,
      cellStyles: false,
    });

    if (workbook.SheetNames.length > limits.maxSheets)
      throw new XlsxWorkbookError("TOO_MANY_SHEETS");

    let workbookCellCount = 0;
    let selectedRange: XLSX.Range | null = null;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const range = XLSX.utils.decode_range(
        sheet["!fullref"] || sheet["!ref"] || "A1:A1"
      );
      const rowCount = range.e.r - range.s.r + 1;
      const columnCount = range.e.c - range.s.c + 1;
      if (rowCount > limits.maxRowsPerSheet)
        throw new XlsxWorkbookError("TOO_MANY_ROWS");
      if (columnCount > limits.maxColumnsPerSheet)
        throw new XlsxWorkbookError("TOO_MANY_COLUMNS");

      workbookCellCount += rowCount * columnCount;
      if (workbookCellCount > limits.maxCellsPerWorkbook)
        throw new XlsxWorkbookError("TOO_MANY_CELLS");

      for (const address of Object.keys(sheet)) {
        if (address.startsWith("!")) continue;
        const cell = sheet[address];
        if (
          typeof cell?.v === "string" &&
          cell.v.length > limits.maxCellTextLength
        )
          throw new XlsxWorkbookError("CELL_TEXT_TOO_LONG");
        if (
          typeof cell?.f === "string" &&
          cell.f.length > limits.maxFormulaLength
        )
          throw new XlsxWorkbookError("FORMULA_TOO_LONG");
      }

      if (sheetName === requiredSheetName) selectedRange = range;
    }

    const sheet = workbook.Sheets[requiredSheetName];
    if (!sheet || !selectedRange)
      throw new XlsxWorkbookError("MISSING_SHEET");

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: null,
    }) as unknown[][];

    return {
      sheetName: requiredSheetName,
      rows,
      metrics: {
        sheetCount: workbook.SheetNames.length,
        rowCount: selectedRange.e.r - selectedRange.s.r + 1,
        columnCount: selectedRange.e.c - selectedRange.s.c + 1,
        cellCount: workbookCellCount,
      },
    };
  });
}
