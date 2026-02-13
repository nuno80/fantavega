import { db } from "../src/lib/db";

async function main() {
  const leagueId = 8;
  const playerId = 7316;

  console.log(`Checking auction for Player ${playerId} in League ${leagueId}...`);
  const res = await db.execute({
    sql: "SELECT * FROM auctions WHERE auction_league_id = ? AND player_id = ?",
    args: [leagueId, playerId]
  });

  if (res.rows.length === 0) {
    console.log("No auction found.");
  } else {
    console.log("Auction found:", res.rows[0]);
  }
}

main().catch(console.error);
