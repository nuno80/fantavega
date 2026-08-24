export const DEBUG_PARTICIPANT_FIELDS = [
  "user_id",
  "league_id",
  "locked_credits",
  "current_budget",
] as const;

export function projectDebugRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      fields.map((field) => [field, row[field] === undefined ? null : row[field]]),
    ),
  );
}
