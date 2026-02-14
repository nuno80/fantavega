import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const userId = "user_36pgTn3e1HtCOqQ4AsrfBh6oHHE";
    const leagueId = 8;
    const auctionId = 250;

    // 1. Verify Team Name
    const participantResult = await client.execute({
      sql: "SELECT manager_team_name FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, userId],
    });

    if (participantResult.rows.length > 0) {
      console.log(`Team Name for ${userId}: ${participantResult.rows[0].manager_team_name}`);
    } else {
      console.log(`User ${userId} is not a participant in League ${leagueId}`);
    }

    // 2. Get Last 5 Bids (Full Details)
    console.log("\nLast 5 Bids for Auction 250:");
    const bidsResult = await client.execute({
      sql: `
        SELECT b.id, b.amount, b.bid_time, b.user_id, u.username, lp.manager_team_name
        FROM bids b
        LEFT JOIN users u ON b.user_id = u.id
        LEFT JOIN league_participants lp ON b.user_id = lp.user_id AND lp.league_id = ?
        WHERE b.auction_id = ?
        ORDER BY b.bid_time DESC
        LIMIT 5
      `,
      args: [leagueId, auctionId],
    });

    bidsResult.rows.forEach((bid) => {
      const time = new Date(Number(bid.bid_time) * 1000).toISOString();
      console.log(`- [${time}] Bid ID: ${bid.id}, Amount: ${bid.amount} | User: ${bid.username} (${bid.manager_team_name})`);
    });

  } catch (error) {
    console.error("Error checking details:", error);
  } finally {
    client.close();
  }
}

main();
