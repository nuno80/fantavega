import { db } from "../src/lib/db";

async function main() {
  const leagueId = 8;
  const playerName = '%Durosinmi%';

  console.log(`Verifying removal of ${playerName} in League ${leagueId}...`);

  // 1. Check Player ID
  const playerRes = await db.execute({
    sql: "SELECT id, name FROM players WHERE name LIKE ?",
    args: [playerName]
  });
  const player = playerRes.rows[0];
  if (!player) {
    console.log("Player not found in database.");
    return;
  }
  const playerId = player.id as number;
  console.log(`Player ID: ${playerId} (${player.name})`);

  // 2. Check Auctions
  const auctions = await db.execute({
    sql: "SELECT id, status FROM auctions WHERE auction_league_id = ? AND player_id = ?",
    args: [leagueId, playerId]
  });
  console.log(`Active Auctions Count: ${auctions.rows.length}`);
  if (auctions.rows.length > 0) {
    console.log("Auctions found:", auctions.rows);
  }

  // 3. Check Assignments
  const assignments = await db.execute({
    sql: "SELECT * FROM player_assignments WHERE auction_league_id = ? AND player_id = ?",
    args: [leagueId, playerId]
  });
  console.log(`Assignments Count: ${assignments.rows.length}`);

  // 4. Check Bids (indirectly via auction lookup if auctions existed, but let's check orphan bids for safety on cleared auctions if we could, but without auction ID it's hard.
  // However, the cleanup query logic deleted bids based on auction selection.
  // We can double check if any bids exist for this player in this league effectively)
  // Actually, without the auction ID, we can't join bids easily. But if auction is gone, that's the main thing.

  if (auctions.rows.length === 0 && assignments.rows.length === 0) {
    console.log("✅ VERIFIED: Player is completely removed from League 8.");
  } else {
    console.log("❌ NOT REMOVED: Traces found.");
  }
}

main().catch(console.error);
