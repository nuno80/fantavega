import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const auctionId = 250;

    console.log("=== FINAL VERIFICATION FOR AUCTION 250 ===");

    // 1. Check Auction winner and deadline
    const auction = await client.execute({
      sql: "SELECT current_highest_bidder_id, current_highest_bid_amount, scheduled_end_time, status FROM auctions WHERE id = ?",
      args: [auctionId]
    });
    const a = auction.rows[0];
    console.log(`\n[AUCTION] Winner ID: ${a.current_highest_bidder_id}`);
    console.log(`[AUCTION] Amount: ${a.current_highest_bid_amount}`);
    console.log(`[AUCTION] Scheduled End: ${new Date(Number(a.scheduled_end_time) * 1000).toISOString()} (ITA: 22:23:48)`);
    console.log(`[AUCTION] Status: ${a.status}`);

    // 2. Check Bids ownership
    const topBid = await client.execute({
      sql: "SELECT id, amount, user_id FROM bids WHERE auction_id = ? ORDER BY amount DESC LIMIT 1",
      args: [auctionId]
    });
    const tb = topBid.rows[0];
    console.log(`\n[TOP BID] Bid ID: ${tb.id}, Amount: ${tb.amount}, User ID: ${tb.user_id}`);

    if (tb.user_id === a.current_highest_bidder_id) {
      console.log("✅ Bid and Auction Winner are CONSISTENT.");
    } else {
      console.log("❌ INCONSISTENCY DETECTED between Bid and Auction Winner!");
    }

    // 3. Check Timers
    const timers = await client.execute({
      sql: "SELECT * FROM user_auction_response_timers WHERE auction_id = ?",
      args: [auctionId]
    });
    console.log(`\n[TIMERS] Count: ${timers.rows.length}`);
    timers.rows.forEach(t => {
      console.log(`- User: ${t.user_id}, Status: ${t.status}, Created: ${new Date(Number(t.created_at) * 1000).toISOString()}`);
    });

    console.log("\n=== VERIFICATION COMPLETE ===");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

main();
