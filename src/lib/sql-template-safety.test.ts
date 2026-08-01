// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SQL template safety", () => {
  it("does not contain JavaScript line comments inside auction-state SQL", () => {
    const file = readFileSync(resolve(process.cwd(), "src/app/api/leagues/[league-id]/auction-state/route.ts"), "utf8");
    const sqlTemplates = [...file.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
    const hasBrokenSqlComment = sqlTemplates.some((sql) => /(^|\n)\s*[^-\n]*\/\//.test(sql));
    expect(hasBrokenSqlComment).toBe(false);
  });
});
