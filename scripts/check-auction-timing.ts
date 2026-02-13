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

    console.log("=== AUCTION TIMING INFO ===");

    // 1. Get League timer duration
    const league = await client.execute({
      sql: "SELECT timer_duration_minutes, min_bid FROM auction_leagues WHERE id = ?",
      args: [leagueId]
    });
    console.log(`[LEAGUE] Timer Duration (minutes): ${league.rows[0].timer_duration_minutes}`);

    // 2. Get Auction timing details
    const auction = await client.execute({
      sql: "SELECT start_time, scheduled_end_time, status FROM auctions WHERE id = ?",
      args: [auctionId]
    });
    const a = auction.rows[0];
    console.log(`[AUCTION] Status: ${a.status}`);
    console.log(`[AUCTION] Start Time: ${new Date(Number(a.start_time) * 1000).toISOString()}`);
    console.log(`[AUCTION] Scheduled End Time: ${new Date(Number(a.scheduled_end_time) * 1000).toISOString()}`);

    // 3. Get Last Bid Time
    const lastBid = await client.execute({
      sql: "SELECT bid_time FROM bids WHERE auction_id = ? ORDER BY bid_time DESC LIMIT 1",
      args: [auctionId]
    });
    if (lastBid.rows.length > 0) {
      const lb = lastBid.rows[0];
      console.log(`[BID] Last Bid Time: ${new Date(Number(lb.bid_time) * 1000).toISOString()}`);

      const expectedEnd = Number(lb.bid_time) + (Number(league.rows[0].timer_duration_minutes) * 60);
      console.log(`[CALC] Expected End Time (BidTime + Duration): ${new Date(expectedEnd * 1000).toISOString()}`);
    }

    const now = Math.floor(Date.now() / 1000);
    console.log(`[SYSTEM] Current Server Time: ${new Date(now * 1000).toISOString()}`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

main();
