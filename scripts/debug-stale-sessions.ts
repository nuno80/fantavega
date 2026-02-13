import { createClient } from "@libsql/client";

async function main() {
  const url = "libsql://fantavega50-fantavega50.aws-eu-west-1.turso.io";
  const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjQ0MjUwNzYsImlkIjoiZjNiOWViMWItMzQxZi00Y2YyLWI3YTQtNDRhMzZjNWE5MjQ5IiwicmlkIjoiZGQwMjViOGItYWFhMy00MjczLWJmZDctMjZjOTIxZDJiMTUwIn0.EZy8Q3ILC2gfvvXiKEHJQge5KF5gWPTvau1mgHWf8tcbSgXov6UeJ02qZ3pylo5OOmHV1BTSOFkSH6m_DxUyDQ";

  const client = createClient({
    url,
    authToken,
  });

  try {
    const now = Math.floor(Date.now() / 1000);
    console.log(`Current Time: ${new Date(now * 1000).toISOString()}`);

    // Count all "active" sessions
    const activeSessionsResult = await client.execute({
      sql: `
            SELECT
                id,
                user_id,
                session_start,
                datetime(session_start, 'unixepoch') as start_readable
            FROM user_sessions
            WHERE session_end IS NULL
            ORDER BY session_start ASC
        `,
      args: []
    });

    console.log(`\nFound ${activeSessionsResult.rows.length} sessions with session_end = NULL:`);
    activeSessionsResult.rows.forEach(s => {
      const ageHours = (now - Number(s.session_start)) / 3600;
      console.log(`- User: ${s.user_id}, Start: ${s.start_readable}, Age: ${ageHours.toFixed(1)} hours`);
    });

    // Check sessions specifically for users in League 9
    const league9Users = await client.execute({
      sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = 9",
      args: []
    });

    console.log("\nSessions for League 9 Participants:");
    for (const user of league9Users.rows) {
      const userSession = await client.execute({
        sql: "SELECT session_end FROM user_sessions WHERE user_id = ? AND session_end IS NULL",
        args: [user.user_id]
      });
      if (userSession.rows.length > 0) {
        console.log(`- Team: ${user.manager_team_name} (User: ${user.user_id}) - STALE SESSION DETECTED`);
      }
    }

  } catch (error) {
    console.error("Error executing queries:", error);
  } finally {
    client.close();
  }
}

main();
