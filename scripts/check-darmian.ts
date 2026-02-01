import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function checkDarmianQuotation() {
  try {
    const result = await client.execute({
      sql: `SELECT id, name, role, team, initial_quotation, current_quotation
            FROM players
            WHERE name LIKE ?`,
      args: ["%Darmian%"],
    });

    console.log("=== Darmian Player Data ===");
    if (result.rows.length > 0) {
      result.rows.forEach((row) => {
        console.log("\nPlayer ID:", row.id);
        console.log("Name:", row.name);
        console.log("Role:", row.role);
        console.log("Team:", row.team);
        console.log("Initial Quotation:", row.initial_quotation);
        console.log("Current Quotation:", row.current_quotation);
      });
    } else {
      console.log("No player found with name containing 'Darmian'");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.close();
  }
}

checkDarmianQuotation();
