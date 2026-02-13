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

    // 1. Find the 3 users from Lukaku's auction timers
    const userIds = [
      'user_36naxV1BTI1KxszgGueVsOBc2Wq', // cancelled
      'user_36q5Xb1zxy1FXeHnMiaUxfrzUwu', // abandoned
      'user_39KwDnGH5tT1qwQELtCq57kYZ7z'  // expired
    ];

    console.log("Checking session history for users in Lukaku auction...");

    for (const userId of userIds) {
      const sessionResult = await client.execute({
        sql: `
                SELECT
                    id,
                    session_start,
                    session_end,
                    datetime(session_start, 'unixepoch') as start_readable,
                    datetime(session_end, 'unixepoch') as end_readable
                FROM user_sessions
                WHERE user_id = ?
                ORDER BY session_start DESC
                LIMIT 5
            `,
        args: [userId]
      });

      console.log(`\nUser: ${userId}`);
      if (sessionResult.rows.length === 0) {
        console.log("  No sessions found.");
      } else {
        sessionResult.rows.forEach(s => {
          console.log(`  Session ID: ${s.id}, Start: ${s.start_readable}, End: ${s.end_readable || 'ACTIVE'}`);
        });
      }
    }

    // 2. Check the specific timer for the expired user
    const expiredTimer = await client.execute({
      sql: "SELECT * FROM user_auction_response_timers WHERE user_id = 'user_39KwDnGH5tT1qwQELtCq57kYZ7z' AND auction_id = 235",
      args: []
    });
    console.log("\nExpired Timer Detail:", expiredTimer.rows[0]);

    if (expiredTimer.rows[0]) {
      const t = expiredTimer.rows[0];
      console.log(`  Created: ${new Date(Number(t.created_at) * 1000).toISOString()}`);
      console.log(`  Activated: ${t.activated_at ? new Date(Number(t.activated_at) * 1000).toISOString() : 'NULL'}`);
      console.log(`  Deadline: ${t.response_deadline ? new Date(Number(t.response_deadline)).toISOString() : 'NULL'}`);
    }

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
