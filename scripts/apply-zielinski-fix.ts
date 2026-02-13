import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const rigatonenId = "user_36pT8dksMTAvpQZhTRw0VcUYmQi";
    const armandoId = "user_36pgTn3e1HtCOqQ4AsrfBh6oHHE";
    const auctionId = 250;
    const bidId = 501; // L'offerta da 45

    console.log("=== APPLYING FIX FOR ZIELINSKI (Auction 250) ===");

    // 1. Update Bid 501 to Rigatonen
    console.log(`Updating Bid ${bidId}: Setting user_id to Rigatonen (${rigatonenId})...`);
    await client.execute({
      sql: "UPDATE bids SET user_id = ? WHERE id = ?",
      args: [rigatonenId, bidId]
    });

    // 2. Remove any timers for Armando on this auction
    console.log(`Removing timers for Armando on Auction ${auctionId}...`);
    await client.execute({
      sql: "DELETE FROM user_auction_response_timers WHERE auction_id = ? AND user_id = ?",
      args: [auctionId, armandoId]
    });

    // 3. Optional: Align scheduled_end_time to 24h from last bid if user wants.
    // Last Bid was 11/02 21:23:48 UTC (1770845028)
    // 24h after is 12/02 21:23:48 UTC (1770931428)

    // For now, I won't change the time unless the user asks,
    // but I'll display what it should be.
    const lastBidTime = 1770845028;
    const correctDeadline = lastBidTime + (24 * 60 * 60);
    console.log(`\nNOTE: La chiusura corretta (24h) sarebbe: ${new Date(correctDeadline * 1000).toISOString()}`);
    console.log(`(Circa stasera alle 22:23 ora italiana)`);

    console.log("\n=== FIX APPLIED SUCCESSFULLY ===");

  } catch (error) {
    console.error("Error applying fix:", error);
  } finally {
    client.close();
  }
}

main();
