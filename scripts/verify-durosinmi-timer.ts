
import { db } from "../src/lib/db";

async function main() {
  try {
    const rows = await db.execute({
      sql: `SELECT id, scheduled_end_time, updated_at FROM auctions WHERE id = 288`,
      args: []
    });

    if (rows.rows.length === 0) {
      console.error("❌ Auction 288 not found.");
      process.exit(1);
    }

    const auction = rows.rows[0] as any;
    console.log(`✅ Auction ID: ${auction.id}`);
    console.log(`🕒 Start Time:   ${new Date(auction.start_time * 1000).toLocaleString()}`);
    console.log(`🕒 End Time:     ${new Date(auction.scheduled_end_time * 1000).toLocaleString()}`);
    console.log(`🕒 Last Updated: ${new Date(auction.updated_at * 1000).toLocaleString()}`);

    process.exit(0);
  } catch (e) {
    console.error("❌ Error:", e);
    process.exit(1);
  }
}

main();
