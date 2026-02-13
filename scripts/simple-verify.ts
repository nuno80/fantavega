import fs from "fs";
import { db } from "../src/lib/db";

async function main() {
  try {
    const auctions = await db.execute({
      sql: "SELECT count(*) as count FROM auctions WHERE id = 224",
      args: []
    });
    const count = auctions.rows[0].count as number;
    fs.writeFileSync("verification_result.txt", `Auction 224 count: ${count}`);
  } catch (e) {
    fs.writeFileSync("verification_result.txt", `Error: ${e}`);
  }
}

main();
