import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("expired-auction scheduling ownership", () => {
  it("keeps automatic settlement in the server scheduler", () => {
    const clientSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/players/PlayerSearchInterface.tsx"),
      "utf8"
    );
    const schedulerSource = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/scheduler.ts"),
      "utf8"
    );

    // The recovery endpoint remains available for explicit operations, but a
    // normal browser lifecycle must never start a mutation polling loop.
    expect(clientSource).not.toContain("/process-expired-auctions");
    expect(clientSource).not.toContain("expiredAuctionsInterval");

    // One distributed lease owner performs settlement for every client.
    expect(schedulerSource).toContain(
      "await processExpiredAuctionsAndAssignPlayers();"
    );
  });
});
