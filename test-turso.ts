// test-turso.ts - Simple script to test Turso connection
import dotenv from "dotenv";
import path from "path";

// MUST load env vars BEFORE importing db
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

console.log("Environment variables loaded:");
console.log("TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✓ Set" : "✗ Not set");
console.log("TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "✓ Set" : "✗ Not set");

// NOW import the database
import("./src/lib/db/index.js").then(async ({ db, closeDbConnection }) => {
  try {
    console.log("\n[TEST] Testing Turso connection...");

    // Test 1: Simple query
    const result = await db.execute({
      sql: "SELECT 1 as test",
      args: []
    });
    console.log("[TEST] ✓ Simple query successful:", result.rows[0]);

    // Test 2: Check if tables exist
    const tablesResult = await db.execute({
      sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      args: []
    });
    console.log(`[TEST] ✓ Found ${tablesResult.rows.length} tables in database`);

    if (tablesResult.rows.length === 0) {
      console.log("\n[TEST] ⚠️  Database is empty. Run migration to create tables.");
    } else {
      console.log("[TEST] Tables:", tablesResult.rows.map((r: any) => r.name).join(", "));
    }

    console.log("\n[TEST] ✓ Turso connection test PASSED!");
  } catch (error) {
    console.error("\n[TEST] ✗ Turso connection test FAILED:", error);
    process.exit(1);
  } finally {
    closeDbConnection();
  }
});
