import { describe, expect, it } from "vitest";

import { validateAndNormalizePlayerImportRows } from "@/lib/import/player-row-validation";

describe("validateAndNormalizePlayerImportRows", () => {
  it("reports the Excel row, player id, and invalid optional column", () => {
    const result = validateAndNormalizePlayerImportRows([
      {
        Id: 42,
        R: "A",
        Nome: "Test",
        Squadra: "Roma",
        "Qt.A": 10,
        "Qt.I": 9,
        "FVM M": "not-a-number",
      },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      "Row 3 (ID 42): Invalid numeric value for 'FVM M'",
    ]);
  });

  it("normalizes every field and generates the player-specific photo URL", () => {
    const result = validateAndNormalizePlayerImportRows([
      {
        Id: 77,
        R: "d",
        RM: "Dc",
        Nome: "Èsempio",
        Squadra: " Milan ",
        "Qt.A": "12",
        "Qt.I": "10",
        "Qt.A M": "11.5",
        "Qt.I M": "",
        FVM: "33",
        "FVM M": null,
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      id: 77,
      role: "D",
      role_mantra: "Dc",
      name: "esempio",
      team: "Milan",
      current_quotation_mantra: 11.5,
      initial_quotation_mantra: null,
      fvm: 33,
      fvm_mantra: null,
      photo_url:
        "https://content.fantacalcio.it/web/cfa/calciatori/large/77.png",
    });
  });
});
