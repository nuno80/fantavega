import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RESPONSE_TIMER_STATUSES } from "./response-timer-status";

describe("response timer status contract", () => {
  it("matches the CHECK constraint declared in schema.sql", () => {
    const schema = readFileSync(
      join(process.cwd(), "database/schema.sql"),
      "utf8"
    );
    const table = schema.split(
      "CREATE TABLE IF NOT EXISTS user_auction_response_timers"
    )[1];
    expect(table).toBeDefined();

    const check = /status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \(([^)]+)\)\)/.exec(
      table
    );
    expect(check).not.toBeNull();

    const allowed = check![1]
      .split(",")
      .map((value) => value.trim().replace(/'/g, ""));

    expect([...allowed].sort()).toEqual([...RESPONSE_TIMER_STATUSES].sort());
  });
});
