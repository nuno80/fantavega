import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const LEAGUE_ID = 9;

    // 1. Find Lukaku
    const playerResult = await client.execute({
      sql: "SELECT id, name FROM players WHERE name LIKE ?",
      args: ["%Lukaku%"],
    });

    if (playerResult.rows.length === 0) {
      console.log("Player Lukaku not found.");
      return;
    }

    const player = playerResult.rows[0];
    console.log(`Found Player: ${player.name} (ID: ${player.id})`);

    // 2. Find Participant (Deportivo la Cadrega)
    const participantResult = await client.execute({
      sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = ? AND manager_team_name LIKE ?",
      args: [LEAGUE_ID, "%la Cadrega%"],
    });

    if (participantResult.rows.length === 0) {
      console.log("Participant 'T.M. Deportivo la Cadrega' not found in League 9.");
    } else {
      const part = participantResult.rows[0];
      console.log(`Found Participant: ${part.manager_team_name} (User ID: ${part.user_id})`);
    }

    // 3. Find Auction for Lukaku in League 9
    const auctionResult = await client.execute({
      sql: "SELECT id, status, current_highest_bid_amount, current_highest_bidder_id, auction_league_id FROM auctions WHERE player_id = ? AND auction_league_id = ?",
      args: [player.id, LEAGUE_ID],
    });

    if (auctionResult.rows.length === 0) {
      console.log(`Auction for Lukaku in League ${LEAGUE_ID} not found.`);
      // List all auctions for this player to be sure
      const allAuctions = await client.execute({
        sql: "SELECT id, auction_league_id, status FROM auctions WHERE player_id = ?",
        args: [player.id]
      });
      console.log("Other auctions for this player:", allAuctions.rows);
      return;
    }

    const auction = auctionResult.rows[0];
    console.log(`Found Auction ID: ${auction.id}, Status: ${auction.status}, Current Bid: ${auction.current_highest_bid_amount}`);

    // 4. Get Bids history
    const bidsResult = await client.execute({
      sql: "SELECT id, amount, bid_time, user_id FROM bids WHERE auction_id = ? ORDER BY bid_time DESC",
      args: [auction.id],
    });

    console.log("\nBids History:");
    bidsResult.rows.forEach((bid) => {
      console.log(`- Bid ID: ${bid.id}, Amount: ${bid.amount}, Time: ${new Date(Number(bid.bid_time) * 1000).toISOString()}, User: ${bid.user_id}`);
    });

    // 5. Get Response Timers
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

    // 6. Check User Compliance Status (sample)
    const complianceResult = await client.execute({
      sql: "SELECT * FROM user_league_compliance_status WHERE league_id = ?",
      args: [LEAGUE_ID]
    });
    console.log("\nCompliance Status for League participants (sample):", complianceResult.rows.slice(0, 5));

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
