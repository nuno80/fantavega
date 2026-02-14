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

    // Get User Details
    const userResult = await client.execute({
      sql: "SELECT username, full_name, email FROM users WHERE id = ?",
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      console.log(`User ${userId} not found.`);
    } else {
      const user = userResult.rows[0];
      console.log(`User ID: ${userId}`);
      console.log(`Username: ${user.username}`);
      console.log(`Full Name: ${user.full_name}`);
      console.log(`Email: ${user.email}`);
    }

    // Double check bid time from previous output
    // Bid ID: 501, Amount: 45, Time: 2026-02-11T21:23:48.000Z

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
