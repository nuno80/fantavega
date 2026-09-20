import { type Client, createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db } from "@/lib/db";
import { hasDueBackgroundWork } from "@/lib/db/services/scheduler-work.service";

vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));

const client = db as Client;
const NOW = 2_000_000_000;

describe("scheduler due-work preflight", () => {
  beforeAll(async () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "database", "schema.sql"),
      "utf8"
    );
    await client.executeMultiple(schema);

    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('manager-1', 'manager@test.dev', 'manager-1', 'manager', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auction_leagues
            (id, name, status, initial_budget_per_manager, admin_creator_id, active_auction_roles)
            VALUES (1, 'Idle league', 'market_closed', 500, 'manager-1', 'ALL')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO players
            (id, role, name, team, current_quotation, initial_quotation)
            VALUES (1, 'P', 'Test player', 'Test team', 1, 1)`,
      args: [],
    });
  });

  beforeEach(async () => {
    await client.batch([
      "DELETE FROM user_auction_response_timers",
      "DELETE FROM user_league_compliance_status",
      "DELETE FROM auctions",
    ]);
    await client.execute({
      sql: "UPDATE auction_leagues SET status = 'market_closed', active_auction_roles = 'ALL' WHERE id = 1",
      args: [],
    });
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns false when the market is closed and no timers are due", async () => {
    await expect(hasDueBackgroundWork(NOW)).resolves.toBe(false);
  });

  it("detects an expired auction", async () => {
    await client.execute({
      sql: `INSERT INTO auctions
            (auction_league_id, player_id, start_time, scheduled_end_time,
             current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (1, 1, ?, ?, 10, 'manager-1', 'active')`,
      args: [NOW - 100, NOW - 1],
    });

    await expect(hasDueBackgroundWork(NOW)).resolves.toBe(true);
  });

  it("detects an expired response timer", async () => {
    const auction = await client.execute({
      sql: `INSERT INTO auctions
            (auction_league_id, player_id, start_time, scheduled_end_time,
             current_highest_bid_amount, current_highest_bidder_id, status)
            VALUES (1, 1, ?, ?, 10, 'manager-1', 'active')
            RETURNING id`,
      args: [NOW - 100, NOW + 3_600],
    });
    await client.execute({
      sql: `INSERT INTO user_auction_response_timers
            (auction_id, user_id, response_deadline, status)
            VALUES (?, 'manager-1', ?, 'pending')`,
      args: [Number(auction.rows[0].id), NOW - 1],
    });

    await expect(hasDueBackgroundWork(NOW)).resolves.toBe(true);
  });

  it("detects a compliance penalty only while the draft is active", async () => {
    await client.execute({
      sql: "UPDATE auction_leagues SET status = 'draft_active' WHERE id = 1",
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO user_league_compliance_status
            (league_id, user_id, phase_identifier, compliance_timer_start_at,
             penalties_applied_this_cycle)
            VALUES (1, 'manager-1', 'draft_active_ALL_ROLES', ?, 0)`,
      args: [NOW - 3_601],
    });

    await expect(hasDueBackgroundWork(NOW)).resolves.toBe(true);
  });
});
