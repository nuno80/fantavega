import { db } from "../src/lib/db";

async function main() {
  const leagueId = 8;
  const teamNamePattern = '%fc pro secco%';
  const playerNamePattern = '%Durosinmi%';

  // 1. Get User
  const userRes = await db.execute({
    sql: "SELECT user_id, manager_team_name FROM league_participants WHERE league_id = ? AND manager_team_name LIKE ?",
    args: [leagueId, teamNamePattern]
  });
  const user = userRes.rows[0];
  if (user) {
    console.log(`User ID: ${user.user_id} (${user.manager_team_name})`);
  } else {
    console.log("User not found");
  }

  // 2. Get Player
  const playerRes = await db.execute({
    sql: "SELECT id, name FROM players WHERE name LIKE ?",
    args: [playerNamePattern]
  });
  const player = playerRes.rows[0];
  if (player) {
    console.log(`Player ID: ${player.id} (${player.name})`);
  } else {
    console.log("Player not found");
  }
}

main().catch(console.error);
