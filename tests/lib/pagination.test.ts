import { describe, expect, it } from "vitest";

import { parseListParam, parsePagination } from "@/lib/http/pagination";

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

  it("rejects pages whose offset exceeds the configured cap", () => {
    expect(() =>
      parsePagination(new URLSearchParams("page=99999"), { defaultLimit: 20, maxLimit: 100, maxOffset: 1000 }),
    ).toThrow("Invalid pagination parameters");
    expect(
      parsePagination(new URLSearchParams("page=50&limit=20"), { defaultLimit: 20, maxLimit: 100, maxOffset: 1000 }),
    ).toEqual({ page: 50, limit: 20, offset: 980 });
  });
});

describe("parseListParam", () => {
  it("returns [] when absent or only empties", () => {
    expect(parseListParam(new URLSearchParams(), "roles", { maxItems: 3 })).toEqual([]);
    expect(parseListParam(new URLSearchParams("roles=,,"), "roles", { maxItems: 3 })).toEqual([]);
  });

  it("splits, trims and dedupes", () => {
    expect(
      parseListParam(new URLSearchParams("roles= P ,D,,P"), "roles", { maxItems: 3 }),
    ).toEqual(["P", "D"]);
  });

  it("rejects values outside the whitelist and lists above the cap", () => {
    expect(() =>
      parseListParam(new URLSearchParams("roles=P,X"), "roles", { allowed: ["P", "D"], maxItems: 3 }),
    ).toThrow();
    expect(() =>
      parseListParam(new URLSearchParams("teams=A,B,C"), "teams", { maxItems: 2 }),
    ).toThrow();
  });

  it("rejects oversized raw input", () => {
    expect(() =>
      parseListParam(new URLSearchParams(`teams=${"x".repeat(5000)}`), "teams", { maxItems: 64 }),
    ).toThrow();
  });
});
