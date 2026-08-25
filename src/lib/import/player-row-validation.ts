const VALID_ROLES = new Set(["P", "D", "C", "A"]);

export interface NormalizedPlayerImportRow {
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
  photo_url: string;
}

export interface PlayerRowValidationResult {
  rows: NormalizedPlayerImportRow[];
  errors: string[];
}

const sanitizePlayerName = (name: string): string =>
  name
    .trim()
    .replace(/[àáâãäå]/gi, "a")
    .replace(/[èéêë]/gi, "e")
    .replace(/[ìíîï]/gi, "i")
    .replace(/[òóôõöø]/gi, "o")
    .replace(/[ùúûü]/gi, "u")
    .replace(/[ýÿ]/gi, "y")
    .replace(/[ñ]/gi, "n")
    .replace(/[ç]/gi, "c");

function optionalNumber(
  value: unknown
): { valid: true; value: number | null } | { valid: false } {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { valid: true, value: null };
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed)
    ? { valid: true, value: parsed }
    : { valid: false };
}

export function validateAndNormalizePlayerImportRows(
  rows: Array<Record<string, unknown>>
): PlayerRowValidationResult {
  const errors: string[] = [];
  const normalizedRows: NormalizedPlayerImportRow[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const excelRowNumber = rowIndex + 3;
    const idValue = row["Id"];
    const id = Number.parseInt(String(idValue), 10);
    if (!Number.isFinite(id) || id <= 0) {
      errors.push(
        `Row ${excelRowNumber}: Invalid or missing 'Id' ('${idValue}')`
      );
      continue;
    }

    const roleValue = row["R"];
    const role = roleValue?.toString().toUpperCase();
    if (!role || !VALID_ROLES.has(role)) {
      errors.push(
        `Row ${excelRowNumber} (ID ${id}): Invalid or missing 'R' (role) ('${roleValue}')`
      );
      continue;
    }

    const name = row["Nome"]?.toString();
    if (!name || name.trim() === "") {
      errors.push(`Row ${excelRowNumber} (ID ${id}): Missing 'Nome'`);
      continue;
    }

    const team = row["Squadra"]?.toString();
    if (!team || team.trim() === "") {
      errors.push(`Row ${excelRowNumber} (ID ${id}): Missing 'Squadra'`);
      continue;
    }

    const currentQuotation = Number.parseFloat(String(row["Qt.A"]));
    const initialQuotation = Number.parseFloat(String(row["Qt.I"]));
    if (
      !Number.isFinite(currentQuotation) ||
      !Number.isFinite(initialQuotation)
    ) {
      errors.push(
        `Row ${excelRowNumber} (ID ${id}): Invalid numeric value for 'Qt.A' or 'Qt.I'`
      );
      continue;
    }

    const optionalFields = [
      ["Qt.A M", "current_quotation_mantra"],
      ["Qt.I M", "initial_quotation_mantra"],
      ["FVM", "fvm"],
      ["FVM M", "fvm_mantra"],
    ] as const;
    const parsedOptional: Record<string, number | null> = {};
    let optionalValid = true;
    for (const [column, property] of optionalFields) {
      const parsed = optionalNumber(row[column]);
      if (!parsed.valid) {
        errors.push(
          `Row ${excelRowNumber} (ID ${id}): Invalid numeric value for '${column}'`
        );
        optionalValid = false;
        break;
      }
      parsedOptional[property] = parsed.value;
    }
    if (!optionalValid) continue;

    normalizedRows.push({
      id,
      role,
      role_mantra: row["RM"]?.toString().trim() || null,
      name: sanitizePlayerName(name),
      team: team.trim(),
      current_quotation: currentQuotation,
      initial_quotation: initialQuotation,
      current_quotation_mantra: parsedOptional.current_quotation_mantra ?? null,
      initial_quotation_mantra: parsedOptional.initial_quotation_mantra ?? null,
      fvm: parsedOptional.fvm ?? null,
      fvm_mantra: parsedOptional.fvm_mantra ?? null,
      photo_url: `https://content.fantacalcio.it/web/cfa/calciatori/large/${id}.png`,
    });
  }

  return { rows: normalizedRows, errors };
}
