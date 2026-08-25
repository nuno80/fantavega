import { createRequire } from "node:module";
import { Worker, type WorkerOptions } from "node:worker_threads";

export interface XlsxWorkerLimits {
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

export const XLSX_WORKER_RESOURCE_LIMITS = {
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
} as const;

const WORKER_SOURCE = `
  const { parentPort, workerData } = require("node:worker_threads");
  const reject = (code) => { throw { workbookPolicyCode: code }; };
  try {
    const XLSX = require(workerData.modulePath);
    const limits = workerData.limits;
    const workbook = XLSX.read(Buffer.from(workerData.bytes), {
      type: "buffer", sheetRows: limits.maxRowsPerSheet + 1, cellText: false,
      cellFormula: true, cellHTML: false, cellStyles: false,
    });
    if (workbook.SheetNames.length > limits.maxSheets) reject("TOO_MANY_SHEETS");
    let workbookCellCount = 0;
    let selectedRange = null;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1:A1");
      const rowCount = range.e.r - range.s.r + 1;
      const columnCount = range.e.c - range.s.c + 1;
      if (rowCount > limits.maxRowsPerSheet) reject("TOO_MANY_ROWS");
      if (columnCount > limits.maxColumnsPerSheet) reject("TOO_MANY_COLUMNS");
      workbookCellCount += rowCount * columnCount;
      if (workbookCellCount > limits.maxCellsPerWorkbook) reject("TOO_MANY_CELLS");
      for (const address of Object.keys(sheet)) {
        if (address.startsWith("!")) continue;
        const cell = sheet[address];
        if (typeof cell?.v === "string" && cell.v.length > limits.maxCellTextLength) reject("CELL_TEXT_TOO_LONG");
        if (typeof cell?.f === "string" && cell.f.length > limits.maxFormulaLength) reject("FORMULA_TOO_LONG");
      }
      if (sheetName === workerData.requiredSheetName) selectedRange = range;
    }
    const sheet = workbook.Sheets[workerData.requiredSheetName];
    if (!sheet || !selectedRange) reject("MISSING_SHEET");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
    parentPort.postMessage({ ok: true, projected: {
      sheetName: workerData.requiredSheetName, rows, metrics: {
        sheetCount: workbook.SheetNames.length,
        rowCount: selectedRange.e.r - selectedRange.s.r + 1,
        columnCount: selectedRange.e.c - selectedRange.s.c + 1,
        cellCount: workbookCellCount,
      },
    } });
  } catch (error) {
    parentPort.postMessage({ ok: false, code: error && error.workbookPolicyCode ? error.workbookPolicyCode : "INVALID_WORKBOOK" });
  }
`;

interface WorkerSuccess {
  ok: true;
  projected: ProjectedWorkbook;
}
interface WorkerFailure {
  ok: false;
  code: string;
}
type WorkerResult = WorkerSuccess | WorkerFailure;
interface WorkerLike {
  once(event: "message", listener: (value: WorkerResult) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "exit", listener: (exitCode: number) => void): this;
  terminate(): Promise<number>;
}
export type XlsxWorkerSpawner = (
  source: string,
  options: WorkerOptions
) => WorkerLike;

export class XlsxWorkerError extends Error {
  constructor(public readonly code: string) {
    super(
      code === "PARSE_TIMEOUT"
        ? "Excel workbook parsing exceeded the allowed duration."
        : code === "PARSER_BUSY"
          ? "Excel workbook parser is busy. Try again later."
          : "The uploaded Excel workbook was rejected."
    );
    this.name = "XlsxWorkerError";
  }
}

export interface XlsxWorkerReadOptions {
  limits: XlsxWorkerLimits;
  timeoutMs: number;
  requiredSheetName: string;
}

export function createXlsxWorkerReader(config?: {
  maxConcurrency?: number;
  spawnWorker?: XlsxWorkerSpawner;
}) {
  const maxConcurrency = config?.maxConcurrency ?? 2;
  const spawnWorker: XlsxWorkerSpawner =
    config?.spawnWorker ?? ((source, options) => new Worker(source, options));
  let activeWorkers = 0;
  return async function readXlsxRowsInWorker(
    fileBuffer: Buffer,
    options: XlsxWorkerReadOptions
  ): Promise<ProjectedWorkbook> {
    if (activeWorkers >= maxConcurrency)
      throw new XlsxWorkerError("PARSER_BUSY");
    activeWorkers += 1;
    try {
      const modulePath = createRequire(import.meta.url).resolve("xlsx");
      const bytes = Uint8Array.from(fileBuffer);
      return await new Promise((resolve, reject) => {
        let settled = false;
        const worker = spawnWorker(WORKER_SOURCE, {
          eval: true,
          workerData: {
            modulePath,
            bytes,
            limits: options.limits,
            requiredSheetName: options.requiredSheetName,
          },
          transferList: [bytes.buffer],
          resourceLimits: XLSX_WORKER_RESOURCE_LIMITS,
        });
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          void worker.terminate();
          callback();
        };
        const timer = setTimeout(
          () => finish(() => reject(new XlsxWorkerError("PARSE_TIMEOUT"))),
          options.timeoutMs
        );
        worker.once("message", (result) =>
          finish(() =>
            result.ok
              ? resolve(result.projected)
              : reject(new XlsxWorkerError(result.code))
          )
        );
        worker.once("error", () =>
          finish(() => reject(new XlsxWorkerError("INVALID_WORKBOOK")))
        );
        worker.once("exit", (exitCode) => {
          if (exitCode !== 0)
            finish(() => reject(new XlsxWorkerError("INVALID_WORKBOOK")));
        });
      });
    } finally {
      activeWorkers -= 1;
    }
  };
}

export const readXlsxRowsInWorker = createXlsxWorkerReader();
