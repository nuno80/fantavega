interface PaginationOptions {
  defaultLimit: number;
  maxLimit: number;
  // ponytail: optional cap so existing callers don't change; deep paging does a
  // full OFFSET scan on Turso, so cap it once callers fetch at most a few pages.
  maxOffset?: number;
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
  { defaultLimit, maxLimit, maxOffset }: PaginationOptions,
): Pagination {
  const page = parsePositiveInteger(searchParams.get("page"), 1);
  const limit = parsePositiveInteger(searchParams.get("limit"), defaultLimit);
  if (limit > maxLimit) throw new Error("Invalid pagination parameters");

  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) throw new Error("Invalid pagination parameters");
  if (maxOffset !== undefined && offset > maxOffset) {
    throw new Error("Invalid pagination parameters");
  }
  return { page, limit, offset };
}

export interface ListParamOptions {
  maxItems: number;
  maxRawLength?: number;
  allowed?: readonly string[];
}

export function parseListParam(
  searchParams: URLSearchParams,
  key: string,
  { maxItems, maxRawLength = 2000, allowed }: ListParamOptions,
): string[] {
  const raw = searchParams.get(key);
  if (raw === null) return [];
  if (raw.length > maxRawLength) throw new Error("Invalid list parameters");
  const items = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
  if (items.length > maxItems) throw new Error("Invalid list parameters");
  if (allowed && items.some((item) => !allowed.includes(item))) {
    throw new Error("Invalid list parameters");
  }
  return items;
}
