import { db } from "../lib/db";
import { updateLeagueStatus } from "../lib/db/services/auction-league.service";
import { placeInitialBidAndCreateAuction } from "../lib/db/services/bid.service";

async function main() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const suffix = now.toString().slice(-4);

    // 1. Create a test user if needed (assuming existing users for simplicity or using a fixture)
    // We'll use an existing user if possible, or create one.
    // Let's assume we have users. Fetch one.
    const userResult = await db.execute("SELECT id FROM users LIMIT 1");
    if (userResult.rows.length === 0) {
      console.error("No users found");
      process.exit(1);
    }
    const userId = userResult.rows[0].id as string;

    // 2. Create a test league
    const leagueResult = await db.execute({
      sql: `INSERT INTO auction_leagues (name, league_type, initial_budget_per_manager, status, admin_creator_id, created_at, updated_at, slots_P, slots_D, slots_C, slots_A)
            VALUES (?, 'classic', 500, 'draft_active', ?, ?, ?, 2, 8, 8, 6) RETURNING id`,
      args: [`Test League ${suffix}`, userId, now, now]
    });
    const leagueId = Number(leagueResult.rows[0].id);

    // 3. Add participant
    await db.execute({
      sql: `INSERT INTO league_participants (league_id, user_id, current_budget, locked_credits, joined_at) VALUES (?, ?, 500, 0, ?)`,
      args: [leagueId, userId, now]
    });

    // 4. Create an active auction
    // Pick a player
    const playerResult = await db.execute("SELECT id, role FROM players WHERE role='A' LIMIT 1");
    if (playerResult.rows.length === 0) {
      console.error("No players found");
      process.exit(1);
    }
    const playerId = Number(playerResult.rows[0].id);

    console.log(`[TEST] Creating auction for player ${playerId} in league ${leagueId}`);

    // Place bid (creates auction)
    await placeInitialBidAndCreateAuction(leagueId, playerId, userId, 10);

    // Verify auction is active
    const auctionCheck = await db.execute({
      sql: "SELECT * FROM auctions WHERE auction_league_id = ? AND player_id = ?",
      args: [leagueId, playerId]
    });
    console.log(`[TEST] Auction details before close:`, auctionCheck.rows[0]);

    if (auctionCheck.rows.length === 0 || auctionCheck.rows[0].status !== 'active') {
      console.error("Auction creation failed or not active");
      process.exit(1);
    }

    // 5. Trigger League Close
    console.log(`[TEST] Closing league...`);
    await updateLeagueStatus(leagueId, "market_closed");

    // 6. Verify Auction Closed and Player Assigned
    const auctionAfter = await db.execute({
      sql: "SELECT id, status, current_highest_bidder_id FROM auctions WHERE id = ?",
      args: [auctionCheck.rows[0].id]
    });
    console.log(`[TEST] Auction status after close:`, auctionAfter.rows[0]);

    // Debug Info
    const allAssignments = await db.execute("SELECT * FROM player_assignments");
    console.log(`[DEBUG] All Assignments (Last 5):`, allAssignments.rows.slice(-5));

    const allParticipants = await db.execute({
      sql: "SELECT * FROM league_participants WHERE league_id = ?",
      args: [leagueId]
    });
    console.log(`[DEBUG] League Participants:`, allParticipants.rows);

    const assignment = await db.execute({
      sql: "SELECT * FROM player_assignments WHERE auction_league_id = ? AND player_id = ?",
      args: [leagueId, playerId]
    });
    console.log(`[TEST] Assignment:`, assignment.rows[0]);

    const participant = await db.execute({
      sql: "SELECT current_budget, locked_credits, players_A_acquired FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, userId]
    });
    console.log(`[TEST] Participant state:`, participant.rows[0]);

    // Validation
    const success =
      auctionAfter.rows[0].status === 'sold' &&
      assignment.rows.length > 0 &&
      participant.rows[0].current_budget === 490 && // 500 - 10
      participant.rows[0].locked_credits === 0 &&
      participant.rows[0].players_A_acquired === 1;

    if (success) {
      console.log(`[TEST] SUCCESS! Verification passed.`);
      process.exit(0);
    } else {
      console.error(`[TEST] FAILURE! Verification failed.`);
      process.exit(1);
    }

  } catch (error) {
    console.error("[TEST] Error:", error);
    process.exit(1);
  }
}

main();
