import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const leagueId = 8;
    const auctionId = 250;

    console.log("=== DIAGNOSIS FOR AUCTION 250 ===");

    // 1. Get Rigatonen ID
    const rigatonen = await client.execute({
      sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = ? AND manager_team_name LIKE ?",
      args: [leagueId, "%Rigatonen%"]
    });
    const rigatonenId = rigatonen.rows[0]?.user_id;
    console.log(`[USER] Rigatonen ID: ${rigatonenId}`);

    // 2. Get Luongobarda ID
    const luongobarda = await client.execute({
      sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = ? AND manager_team_name LIKE ?",
      args: [leagueId, "%luongobarda%"]
    });
    const luongobardaId = luongobarda.rows[0]?.user_id;
    console.log(`[USER] Luongobarda ID: ${luongobardaId}`);

    // 3. Check AUCTIONS Table
    const auction = await client.execute({
      sql: "SELECT current_highest_bidder_id, current_highest_bid_amount FROM auctions WHERE id = ?",
      args: [auctionId]
    });
    const winnerId = auction.rows[0]?.current_highest_bidder_id as string;
    const winningAmount = auction.rows[0]?.current_highest_bid_amount;

    let winnerName = "UNKNOWN";
    if (winnerId === rigatonenId) winnerName = "Rigatonen";
    if (winnerId === luongobardaId) winnerName = "Luongobarda";

    console.log(`[AUCTION] Winner in DB: ${winnerName} (${winnerId}) - Amount: ${winningAmount}`);

    // 4. Check BIDS Table (Top 3)
    const bids = await client.execute({
      sql: "SELECT id, amount, user_id FROM bids WHERE auction_id = ? ORDER BY amount DESC LIMIT 3",
      args: [auctionId]
    });

    console.log("\n[BIDS] Top 3 Bids:");
    bids.rows.forEach(bid => {
      let bidderName = "UNKNOWN";
      if (bid.user_id === rigatonenId) bidderName = "Rigatonen";
      if (bid.user_id === luongobardaId) bidderName = "Luongobarda";
      console.log(`- Bid ID: ${bid.id}, Amount: ${bid.amount}, User: ${bidderName} (${bid.user_id})`);
    });

  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

main();
