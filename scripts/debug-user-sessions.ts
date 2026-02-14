import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const userId = "user_39KwDnGH5tT1qwQELtCq57kYZ7z";
    console.log(`Checking session history for User: ${userId}`);

    const sessions = await client.execute({
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
            LIMIT 20
        `,
      args: [userId]
    });

    console.log(`\nFound ${sessions.rows.length} recent sessions:`);
    sessions.rows.forEach(s => {
      console.log(`- Start: ${s.start_readable}, End: ${s.end_readable || 'ACTIVE'}`);
    });

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
