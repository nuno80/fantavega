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
    console.log(`Checking for ANY active session for User: ${userId}`);

    const result = await client.execute({
      sql: "SELECT id, session_start, datetime(session_start, 'unixepoch') as start_readable FROM user_sessions WHERE user_id = ? AND session_end IS NULL",
      args: [userId]
    });

    if (result.rows.length > 0) {
      console.log(`FOUND ${result.rows.length} ACTIVE SESSIONS (session_end IS NULL):`);
      result.rows.forEach(r => {
        console.log(`- ID: ${r.id}, Start: ${r.start_readable}`);
      });
    } else {
      console.log("NO active sessions found for this user.");
    }

  } catch (error) {
    console.error("Error executing query:", error);
  } finally {
    client.close();
  }
}

main();
