import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const timeout = setTimeout(() => {
  console.log("ERROR: Connection timeout after 10 seconds");
  process.exit(1);
}, 10000);

db.execute("SELECT 1 as test")
  .then((r) => {
    clearTimeout(timeout);
    console.log("Turso connection OK:", r.rows);
    process.exit(0);
  })
  .catch((e) => {
    clearTimeout(timeout);
    console.log("Turso connection ERROR:", e.message);
    process.exit(1);
  });
