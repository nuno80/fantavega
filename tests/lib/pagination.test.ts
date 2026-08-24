import { describe, expect, it } from "vitest";

import { parsePagination } from "@/lib/http/pagination";

describe("parsePagination", () => {
  it("uses defaults and accepts values within the configured cap", () => {
    expect(parsePagination(new URLSearchParams(), { defaultLimit: 20, maxLimit: 100 })).toEqual({
      page: 1,
      limit: 20,
      offset: 0,
    });
    expect(
      parsePagination(new URLSearchParams("page=3&limit=50"), {
        defaultLimit: 20,
        maxLimit: 100,
      }),
    ).toEqual({ page: 3, limit: 50, offset: 100 });
  });

  it("rejects non-integers, non-positive values and limits above the cap", () => {
    for (const query of ["page=0", "page=-1", "page=1.5", "page=nope", "limit=0", "limit=-1", "limit=101"]) {
      expect(() =>
        parsePagination(new URLSearchParams(query), { defaultLimit: 20, maxLimit: 100 }),
      ).toThrow("Invalid pagination parameters");
    }
  });
});
