import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkLeagueBidConfig() {
  try {
    const result = await client.execute({
      sql: "SELECT id, name, min_bid, config_json FROM auction_leagues WHERE id = ?",
      args: [8],
    });

    console.log("=== League Bid Configuration ===");
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log("League ID:", row.id);
      console.log("League Name:", row.name);
      console.log("min_bid:", row.min_bid);
      console.log("config_json:", row.config_json);

      if (row.config_json) {
        try {
          const config = JSON.parse(row.config_json as string);
          console.log("\nParsed config:");
          console.log(JSON.stringify(config, null, 2));
        } catch (e) {
          console.log("Could not parse config_json");
        }
      }
    } else {
      console.log("No league found with ID 8");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

checkLeagueBidConfig();
