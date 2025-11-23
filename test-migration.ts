import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function test() {
  console.log("🧪 Testing Database Connection (Turso/LibSQL)...");

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error("❌ TURSO_DATABASE_URL is not defined in .env.local");
    return;
  }

  console.log(`Target URL: ${url}`);

  try {
    const client = createClient({
      url,
      authToken,
    });

    const result = await client.execute("SELECT 1 as val");
    console.log("✅ Connection successful!");
    console.log("Query Result:", result.rows);

    // Optional: Check for the auction mentioned in the debug file
    console.log("\nChecking for Auction 1069...");
    const auction = await client.execute({
      sql: "SELECT * FROM auctions WHERE id = ?",
      args: [1069]
    });

    if (auction.rows.length > 0) {
      console.log("✅ Auction 1069 found:", auction.rows[0]);
    } else {
      console.log("⚠️ Auction 1069 not found (this might be expected if it doesn't exist)");
    }

  } catch (e) {
    console.error("❌ Connection failed:", e);
  }
}

test();
