// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  XlsxWorkbookError,
  parseXlsxWorkbookInProcess,
} from "@/lib/import/parse-xlsx-workbook";

const limits = {
  maxSheets: 6,
  maxRowsPerSheet: 2_000,
  maxColumnsPerSheet: 32,
  maxCellsPerWorkbook: 50_000,
  maxCellTextLength: 4_096,
  maxFormulaLength: 8_192,
};

function buildWorkbookBuffer(
  sheets: Array<{ name: string; rows: unknown[][] }>
): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name
    );
  }
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("parseXlsxWorkbookInProcess", () => {
  it("parses a workbook and projects the required sheet with metrics", async () => {
    const result = await parseXlsxWorkbookInProcess(
      buildWorkbookBuffer([
        {
          name: "Tutti",
          rows: [
            ["Listone"],
            ["Id", "Nome"],
            [1, "Giocatore"],
          ],
        },
      ]),
      { limits, requiredSheetName: "Tutti" }
    );

    expect(result.sheetName).toBe("Tutti");
    expect(result.rows[1]).toEqual(["Id", "Nome"]);
    expect(result.rows[2]).toEqual(["1", "Giocatore"]);
    expect(result.metrics).toEqual({
      sheetCount: 1,
      rowCount: 3,
      columnCount: 2,
      cellCount: 6,
    });
  });

  it("rejects when the required sheet is missing", async () => {
    await expect(
      parseXlsxWorkbookInProcess(
        buildWorkbookBuffer([{ name: "Altri", rows: [["x"]] }]),
        { limits, requiredSheetName: "Tutti" }
      )
    ).rejects.toBeInstanceOf(XlsxWorkbookError);
  });

  it("rejects workbooks over the sheet budget", async () => {
    const sheets = Array.from({ length: limits.maxSheets + 1 }, (_, i) => ({
      name: `Sheet ${i}`,
      rows: [[i]],
    }));
    await expect(
      parseXlsxWorkbookInProcess(buildWorkbookBuffer(sheets), {
        limits,
        requiredSheetName: "Sheet 0",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_SHEETS" });
  });

  it("rejects sheets over the row budget", async () => {
    const rows = Array.from({ length: limits.maxRowsPerSheet + 1 }, (_, i) => [
      i,
    ]);
    await expect(
      parseXlsxWorkbookInProcess(
        buildWorkbookBuffer([{ name: "Tutti", rows }]),
        { limits, requiredSheetName: "Tutti" }
      )
    ).rejects.toMatchObject({ code: "TOO_MANY_ROWS" });
  });

  it("rejects cell text over the limit", async () => {
    const longCell = "x".repeat(limits.maxCellTextLength + 1);
    await expect(
      parseXlsxWorkbookInProcess(
        buildWorkbookBuffer([{ name: "Tutti", rows: [[longCell]] }]),
        { limits, requiredSheetName: "Tutti" }
      )
    ).rejects.toMatchObject({ code: "CELL_TEXT_TOO_LONG" });
  });
});
