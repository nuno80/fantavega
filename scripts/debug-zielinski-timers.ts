import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    // 1. Find Zielinski
    const playerResult = await client.execute({
      sql: "SELECT id, name FROM players WHERE name LIKE ?",
      args: ["%Zielinski%"],
    });

    if (playerResult.rows.length === 0) {
      console.log("Player Zielinski not found.");
      return;
    }

    const player = playerResult.rows[0];
    console.log(`Found Player: ${player.name} (ID: ${player.id})`);

    // 2. Find Auction in League 8
    const auctionResult = await client.execute({
      sql: "SELECT id, status, current_highest_bid_amount, current_highest_bidder_id FROM auctions WHERE player_id = ? AND auction_league_id = ?",
      args: [player.id, 8],
    });

    if (auctionResult.rows.length === 0) {
      console.log("Auction for Zielinski in League 8 not found.");
      return;
    }

    const auction = auctionResult.rows[0];
    console.log(`Found Auction ID: ${auction.id}, Status: ${auction.status}, Current Bid: ${auction.current_highest_bid_amount}`);

    // 3. Get Last 2 Bids
    const bidsResult = await client.execute({
      sql: "SELECT id, amount, bid_time, user_id FROM bids WHERE auction_id = ? ORDER BY bid_time DESC LIMIT 2",
      args: [auction.id],
    });

    console.log("\nLast 2 Bids:");
    bidsResult.rows.forEach((bid) => {
      console.log(`- Bid ID: ${bid.id}, Amount: ${bid.amount}, Time: ${new Date(Number(bid.bid_time) * 1000).toISOString()}, User: ${bid.user_id}`);
    });

    // 4. Get Response Timers
    const timersResult = await client.execute({
      sql: "SELECT * FROM user_auction_response_timers WHERE auction_id = ?",
      args: [auction.id],
    });

    console.log("\nResponse Timers:");
    if (timersResult.rows.length === 0) {
      console.log("No response timers found for this auction.");
    } else {
      timersResult.rows.forEach(timer => {
        console.log(timer);
        if (timer.response_deadline) {
          console.log(`  -> Deadline: ${new Date(Number(timer.response_deadline)).toISOString()}`);
        }
      });
    }

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
