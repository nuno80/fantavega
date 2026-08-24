interface PaginationOptions {
  defaultLimit: number;
  maxLimit: number;
}

interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new Error("Invalid pagination parameters");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Invalid pagination parameters");
  }
  return parsed;
}

export function parsePagination(
  searchParams: URLSearchParams,
  { defaultLimit, maxLimit }: PaginationOptions,
): Pagination {
  const page = parsePositiveInteger(searchParams.get("page"), 1);
  const limit = parsePositiveInteger(searchParams.get("limit"), defaultLimit);
  if (limit > maxLimit) throw new Error("Invalid pagination parameters");

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new Error("Invalid pagination parameters");
  return { page, limit, offset };
}
