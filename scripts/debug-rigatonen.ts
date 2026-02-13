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
    const currentHighestBidderId = "user_36pgTn3e1HtCOqQ4AsrfBh6oHHE"; // Armando

    // 1. Find who owns 'Rigatonen'
    console.log("Searching for team 'Rigatonen' in League 8...");
    const rigatonenResult = await client.execute({
      sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = ? AND manager_team_name LIKE ?",
      args: [leagueId, "%Rigatonen%"],
    });

    if (rigatonenResult.rows.length === 0) {
      console.log("No team found matching 'Rigatonen'.");
    } else {
      rigatonenResult.rows.forEach(row => {
        console.log(`Found Team: ${row.manager_team_name} (User ID: ${row.user_id})`);
        if (row.user_id === currentHighestBidderId) {
          console.log("MATCH! The highest bidder OWNS Rigatonen.");
        } else {
          console.log("MISMATCH! The highest bidder IS NOT the owner of Rigatonen.");
        }
      });
    }

    // 2. Double Check Current Highest Bidder Details
    console.log(`\nChecking details for Current Highest Bidder (ID: ${currentHighestBidderId})...`);
    const bidderDetails = await client.execute({
      sql: `
            SELECT u.username, lp.manager_team_name
            FROM users u
            JOIN league_participants lp ON u.id = lp.user_id
            WHERE u.id = ? AND lp.league_id = ?
        `,
      args: [currentHighestBidderId, leagueId]
    });

    if (bidderDetails.rows.length > 0) {
      console.log(`Username: ${bidderDetails.rows[0].username}`);
      console.log(`Team Name: ${bidderDetails.rows[0].manager_team_name}`);
    } else {
      console.log("Could not find user/participant details.");
    }

    // 3. Check Auction Status Again
    const auctionStatus = await client.execute({
      sql: "SELECT current_highest_bidder_id, current_highest_bid_amount FROM auctions WHERE id = ?",
      args: [auctionId]
    });
    const auction = auctionStatus.rows[0];
    console.log(`\nAuction Current Winner: ${auction.current_highest_bidder_id} (${auction.current_highest_bid_amount})`);

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
