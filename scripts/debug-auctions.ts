import { db } from "../src/lib/db";

async function main() {
  console.log("Listing active auctions for League 8...");
  const res = await db.execute("SELECT * FROM auctions WHERE auction_league_id = 8 AND status = 'active'");
  console.log(res.rows);
}

main().catch(console.error);
