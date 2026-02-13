import { db } from "../src/lib/db";

async function main() {
  const leagueId = 8;
  const playerName = '%Durosinmi%';
  const bidderId = 'user_36o60LV7cAU6XbfKEpArGATDRdr';

  console.log(`Verifying RESTORATION of ${playerName} in League ${leagueId}...`);

  // 1. Check Player ID
  const playerRes = await db.execute({
    sql: "SELECT id, name FROM players WHERE name LIKE ?",
    args: [playerName]
  });
  const player = playerRes.rows[0];
  const playerId = player.id as number;

  // 2. Check Auctions
  const auctions = await db.execute({
    sql: "SELECT * FROM auctions WHERE auction_league_id = ? AND player_id = ?",
    args: [leagueId, playerId]
  });

  if (auctions.rows.length === 0) {
    console.log("❌ NO AUCTION FOUND!");
    return;
  }

  const auction = auctions.rows[0];
  console.log("Auction Found:", auction);

  if (auction.status === 'active' &&
    auction.current_highest_bid_amount === 20 &&
    auction.current_highest_bidder_id === bidderId) {
    console.log("✅ VERIFIED: Auction restored correctly.");
  } else {
    console.log("⚠️  MISMATCH: Check details above.");
  }
}

main().catch(console.error);
