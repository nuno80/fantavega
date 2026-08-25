// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  MAX_EXCEL_ARCHIVE_ENTRIES,
  preflightXlsxArchive,
} from "@/lib/import/excel-archive-policy";
import { MAX_EXCEL_UPLOAD_BYTES } from "@/lib/import/excel-upload-policy";
import {
  PLAYER_WORKBOOK_LIMITS,
  parsePlayerWorkbook,
} from "@/lib/import/player-workbook-parser";

function buildWorkbook(
  sheets: Array<{ name: string; rows: unknown[][] }>,
  bookType: XLSX.BookType = "xlsx"
): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name
    );
  }

  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType }));
}

describe("parsePlayerWorkbook", () => {
  it("parses a representative Fantacalcio workbook", async () => {
    const buffer = buildWorkbook([
      {
        name: "Tutti",
        rows: [
          ["Listone Fantacalcio"],
          ["Id", "R", "Nome", "Squadra", "Qt.A", "Qt.I"],
          [101, "P", "Portiere Test", "Roma", 12, 10],
        ],
      },
    ]);

    const parsed = await parsePlayerWorkbook(buffer);

    expect(parsed).toEqual({
      sheetName: "Tutti",
      rows: [
        ["Listone Fantacalcio", null, null, null, null, null],
        ["Id", "R", "Nome", "Squadra", "Qt.A", "Qt.I"],
        ["101", "P", "Portiere Test", "Roma", "12", "10"],
      ],
      metrics: {
        sheetCount: 1,
        rowCount: 3,
        columnCount: 6,
        cellCount: 18,
      },
    });
  });

  it("rejects a workbook that exceeds the sheet budget", async () => {
    const sheets = Array.from(
      { length: PLAYER_WORKBOOK_LIMITS.maxSheets + 1 },
      (_, index) => ({
        name: index === 0 ? "Tutti" : `Extra ${index}`,
        rows: [[`Sheet ${index}`]],
      })
    );

    await expect(
      parsePlayerWorkbook(buildWorkbook(sheets))
    ).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "TOO_MANY_SHEETS",
    });
  });

  it("rejects a sheet that exceeds the row budget", async () => {
    const rows = Array.from(
      { length: PLAYER_WORKBOOK_LIMITS.maxRowsPerSheet + 1 },
      (_, index) => [index]
    );

    await expect(
      parsePlayerWorkbook(buildWorkbook([{ name: "Tutti", rows }]))
    ).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "TOO_MANY_ROWS",
    });
  });
  it("rejects a sheet that exceeds the column budget", async () => {
    const rows = [
      Array.from(
        { length: PLAYER_WORKBOOK_LIMITS.maxColumnsPerSheet + 1 },
        (_, index) => `Column ${index}`
      ),
    ];

    await expect(
      parsePlayerWorkbook(buildWorkbook([{ name: "Tutti", rows }]))
    ).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "TOO_MANY_COLUMNS",
    });
  });

  it("rejects a workbook that exceeds the aggregate cell budget", async () => {
    const rows = Array.from({ length: 800 }, (_, rowIndex) =>
      Array.from(
        { length: 32 },
        (_, columnIndex) => `${rowIndex}:${columnIndex}`
      )
    );

    await expect(
      parsePlayerWorkbook(
        buildWorkbook([
          { name: "Tutti", rows },
          { name: "Extra", rows },
        ])
      )
    ).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "TOO_MANY_CELLS",
    });
  });

  it("rejects malformed content instead of treating it as a text workbook", async () => {
    await expect(
      parsePlayerWorkbook(Buffer.from("not-an-excel-workbook"))
    ).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "INVALID_WORKBOOK",
    });
  });

  it("returns a safe policy error for a corrupt ZIP workbook", async () => {
    const corruptZip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00,
    ]);

    await expect(parsePlayerWorkbook(corruptZip)).rejects.toMatchObject({
      name: "WorkbookPolicyError",
      code: "INVALID_WORKBOOK",
    });
  });

  it("rejects pathological cell strings", async () => {
    const longCell = "x".repeat(PLAYER_WORKBOOK_LIMITS.maxCellTextLength + 1);

    await expect(
      parsePlayerWorkbook(
        buildWorkbook([{ name: "Tutti", rows: [[longCell]] }])
      )
    ).rejects.toMatchObject({
      code: "CELL_TEXT_TOO_LONG",
    });
  });
  it("rejects pathological formulas", async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([[1]]);
    worksheet.A1.f = "1+".repeat(PLAYER_WORKBOOK_LIMITS.maxFormulaLength + 1);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tutti");
    const buffer = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    );

    await expect(parsePlayerWorkbook(buffer)).rejects.toMatchObject({
      code: "FORMULA_TOO_LONG",
    });
  });

  it("rejects a ZIP workbook whose declared expansion exceeds the archive budget", async () => {
    const forgedArchive = Buffer.alloc(72);
    forgedArchive.writeUInt32LE(0x04034b50, 0);
    const centralDirectoryOffset = 4;
    forgedArchive.writeUInt32LE(0x02014b50, centralDirectoryOffset);
    forgedArchive.writeUInt32LE(1, centralDirectoryOffset + 20);
    forgedArchive.writeUInt32LE(
      40 * 1024 * 1024 + 1,
      centralDirectoryOffset + 24
    );
    const endOfDirectoryOffset = 50;
    forgedArchive.writeUInt32LE(0x06054b50, endOfDirectoryOffset);
    forgedArchive.writeUInt16LE(1, endOfDirectoryOffset + 8);
    forgedArchive.writeUInt16LE(1, endOfDirectoryOffset + 10);
    forgedArchive.writeUInt32LE(46, endOfDirectoryOffset + 12);
    forgedArchive.writeUInt32LE(
      centralDirectoryOffset,
      endOfDirectoryOffset + 16
    );

    await expect(parsePlayerWorkbook(forgedArchive)).rejects.toMatchObject({
      code: "ARCHIVE_TOO_LARGE",
    });
  });

  it("preserves support for representative legacy XLS workbooks", async () => {
    const buffer = buildWorkbook(
      [
        {
          name: "Tutti",
          rows: [
            ["Listone Fantacalcio"],
            ["Id", "R", "Nome", "Squadra", "Qt.A", "Qt.I"],
            [201, "D", "Difensore Test", "Milan", 8, 7],
          ],
        },
      ],
      "xls"
    );

    expect((await parsePlayerWorkbook(buffer)).rows[2]?.[2]).toBe(
      "Difensore Test"
    );
  });

  it("rejects raw buffers over the service parser boundary", async () => {
    await expect(
      parsePlayerWorkbook(Buffer.alloc(MAX_EXCEL_UPLOAD_BYTES + 1))
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("rejects ZIP archives over the entry-count budget", async () => {
    const archive = Buffer.alloc(26);
    archive.writeUInt32LE(0x04034b50, 0);
    archive.writeUInt32LE(0x06054b50, 4);
    archive.writeUInt16LE(MAX_EXCEL_ARCHIVE_ENTRIES + 1, 12);
    archive.writeUInt16LE(MAX_EXCEL_ARCHIVE_ENTRIES + 1, 14);
    archive.writeUInt32LE(4, 20);

    expect(() => preflightXlsxArchive(archive)).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_ARCHIVE_ENTRIES" })
    );
  });

  it("rejects an EOCD signature forged inside a ZIP comment", () => {
    const archive = Buffer.alloc(94);
    archive.writeUInt32LE(0x04034b50, 0);
    archive.writeUInt32LE(0x02014b50, 4);
    archive.writeUInt32LE(1, 24);
    archive.writeUInt32LE(0x06054b50, 50);
    archive.writeUInt16LE(1, 58);
    archive.writeUInt16LE(1, 60);
    archive.writeUInt32LE(46, 62);
    archive.writeUInt32LE(4, 66);
    archive.writeUInt16LE(22, 70);
    archive.writeUInt32LE(0x06054b50, 72);

    expect(() => preflightXlsxArchive(archive)).toThrowError(
      expect.objectContaining({ code: "INVALID_WORKBOOK" })
    );
  });
});
