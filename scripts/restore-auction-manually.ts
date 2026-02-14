import { db } from "../src/lib/db";

async function main() {
  const leagueId = 8;
  const playerId = 7316;
  const userId = 'user_36o60LV7cAU6XbfKEpArGATDRdr';
  const amount = 20;

  console.log("Starting manual restoration...");

  try {
    const tx = await db.transaction("write");

    try {
      // 1. Insert Auction
      const now = Math.floor(Date.now() / 1000);
      const endTime = now + 86400; // 24h

      const auctionRes = await tx.execute({
        sql: `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status)
              VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [leagueId, playerId, now, endTime, amount, userId, 'active']
      });

      const auctionId = auctionRes.rows[0].id as number;
      console.log(`Auction created with ID: ${auctionId}`);

      // 2. Insert Bid
      await tx.execute({
        sql: `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type)
              VALUES (?, ?, ?, ?, ?)`,
        args: [auctionId, userId, amount, now, 'manual']
      });
      console.log(`Bid inserted for Auction ID: ${auctionId}`);

      // 3. Update Participant credits if needed?
      // User said "fai partire", implying just setting the stage. Ideally the system will calculate correctly.
      // But let's check if we need to lock credits?
      // Step 222 verified credits were correct (69) based on active auctions.
      // If we add a NEW active auction for 20, locked credits SHOULD increase by 20.
      // If we don't update it manually, next time the system recalculates it might be off?
      // Or does the system recalculate dynamically?
      // Usually `bid.service.ts` updates locked_credits.
      // I should manually update locked_credits + 20 to be safe and consistent.

      await tx.execute({
        sql: "UPDATE league_participants SET locked_credits = locked_credits + ? WHERE league_id = ? AND user_id = ?",
        args: [amount, leagueId, userId]
      });
      console.log(`Updated locked_credits for user by +${amount}`);

      await tx.commit();
      console.log("MATCH COMMITTED SUCCESSFULLY.");
    } catch (e) {
      await tx.rollback();
      console.error("Transaction failed, rolled back:", e);
    }
  } catch (e) {
    console.error("DB Error:", e);
  }
}

main().catch(console.error);
