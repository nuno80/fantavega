import { describe, expect, it } from "vitest";

import { validateExcelUpload } from "@/lib/import/excel-upload-policy";

describe("validateExcelUpload", () => {
  it("accepts supported Excel files within 10 MiB", () => {
    expect(
      validateExcelUpload({
        name: "players.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 1024,
      }),
    ).toBeNull();
  });

  it("rejects unsupported types and oversized files", () => {
    expect(validateExcelUpload({ name: "players.txt", type: "text/plain", size: 1024 })).toEqual({
      status: 415,
      error: "Unsupported file type. Upload an .xls or .xlsx file.",
    });
    expect(
      validateExcelUpload({
        name: "players.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 10 * 1024 * 1024 + 1,
      }),
    ).toEqual({
      status: 413,
      error: "File too large. Maximum allowed size is 10 MiB.",
    });
  });
});
