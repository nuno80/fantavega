// src/lib/db/migrate.ts
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local BEFORE importing db
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function runFullSchemaMigration() {
  const schemaPath = path.join(process.cwd(), "database", "schema.sql");
  console.log(
    "[Migrate Script] Running full schema application from database/schema.sql..."
  );

  try {
    // Dynamic import to ensure env vars are loaded first
    const { db, closeDbConnection } = await import("@/lib/db");
    const { applySchemaToDb } = await import("./utils");

    if (!db) {
      console.error(
        "[Migrate Script] Database connection not found. This script relies on a connection being established by importing from @/lib/db. Exiting."
      );
      process.exit(1);
    }

    await applySchemaToDb(db, schemaPath);
    console.log(
      "[Migrate Script] Schema application script finished successfully."
    );

    closeDbConnection();
  } catch (e: unknown) {
    console.error(
      "[Migrate Script] Script failed:",
      e instanceof Error ? e.message : String(e)
    );
    process.exit(1);
  } finally {
    console.log("[Migrate Script] Script execution finished.");
  }
}

runFullSchemaMigration();
