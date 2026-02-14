
import { db } from "../src/lib/db";
import { notifySocketServer } from "../src/lib/socket-emitter";

async function main() {
  const MINUTES_TO_ADD = 1260; // 21 hours
  const PLAYER_NAME_LIKE = '%Durosinmi%';
  const TEAM_NAME_LIKE = '%fc pro secco%';

  try {
    console.log("Searching for active auction...");

    // 1. Find League and Auction
    // Join participants to find the league that has the specific team
    const rows = await db.execute({
      sql: `
            SELECT
                a.id as auction_id,
                a.auction_league_id as league_id,
                a.player_id,
                a.scheduled_end_time,
                p.name as player_name,
                lp.manager_team_name as team_name,
                a.current_highest_bid_amount,
                a.current_highest_bidder_id
            FROM auctions a
            JOIN players p ON a.player_id = p.id
            JOIN auction_leagues al ON a.auction_league_id = al.id
            JOIN league_participants lp ON lp.league_id = al.id
            WHERE p.name LIKE ?
            AND lp.manager_team_name LIKE ?
            AND a.status = 'active'
            LIMIT 1
        `,
      args: [PLAYER_NAME_LIKE, TEAM_NAME_LIKE]
    });

    if (rows.rows.length === 0) {
      console.error("❌ No active auction found for 'Durosinmi' in a league containing 'fc pro secco'.");
      process.exit(1);
    }

    const auction = rows.rows[0] as any;
    console.log(`✅ Found Auction ID: ${auction.auction_id}`);
    console.log(`   Player: ${auction.player_name}`);
    console.log(`   League ID: ${auction.league_id}`);
    console.log(`   Matches Team: ${auction.team_name}`);

    // 2. Calculate New End Time
    const now = Math.floor(Date.now() / 1000);
    const newEndTime = now + (MINUTES_TO_ADD * 60);

    console.log(`\n🕒 Current End Time: ${new Date(auction.scheduled_end_time * 1000).toLocaleString()}`);
    console.log(`🕒 New End Time:     ${new Date(newEndTime * 1000).toLocaleString()} (+${MINUTES_TO_ADD} min)`);

    // 3. Update DB
    await db.execute({
      sql: `UPDATE auctions SET scheduled_end_time = ?, updated_at = ? WHERE id = ?`,
      args: [newEndTime, now, auction.auction_id]
    });

    console.log("\n✅ Database updated successfully.");

    // 4. Notify Socket
    console.log("📡 Emitting Socket.IO event...");

    await notifySocketServer({
      room: `league-${auction.league_id}`,
      event: 'auction-update',
      data: {
        auctionId: auction.auction_id,
        playerId: auction.player_id,
        action: 'timer_update',
        scheduledEndTime: newEndTime,
        newPrice: auction.current_highest_bid_amount,
        highestBidderId: auction.current_highest_bidder_id
      }
    });

    console.log("✅ Socket notification sent.");
    process.exit(0);

  } catch (e) {
    console.error("❌ Error:", e);
    process.exit(1);
  }
}

main();
