import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("legacy response timer migration", () => {
  it("has no activation call sites outside the timer service", () => {
    expect(() => execFileSync("node", ["scripts/assert-no-legacy-timer-activation.mjs"], { stdio: "pipe" })).not.toThrow();
  });
});
