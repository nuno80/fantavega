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
    const correctDeadline = 1770931428; // 12 Feb 2026, 21:23:48 UTC

    console.log(`Setting Auction ${auctionId} Scheduled End Time to ${new Date(correctDeadline * 1000).toISOString()}...`);

    await client.execute({
      sql: "UPDATE auctions SET scheduled_end_time = ? WHERE id = ?",
      args: [correctDeadline, auctionId]
    });

    console.log("=== DEADLINE UPDATED ===");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

main();
