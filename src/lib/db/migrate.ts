// src/lib/db/migrate.ts
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local BEFORE importing db
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function runDatabaseDeployment() {
  const schemaPath = path.join(process.cwd(), "database", "schema.sql");
  console.log("[Migrate Script] Running versioned database deployment...");

  let closeDbConnection: (() => void) | undefined;

  try {
    // Dynamic import to ensure env vars are loaded first
    const databaseModule = await import("@/lib/db");
    const { deployDatabaseSchema } = await import("./utils");
    const { db } = databaseModule;
    closeDbConnection = databaseModule.closeDbConnection;

    if (!db) {
      console.error(
        "[Migrate Script] Database connection not found. This script relies on a connection being established by importing from @/lib/db. Exiting."
      );
      process.exitCode = 1;
      return;
    }

    const result = await deployDatabaseSchema(db, { schemaPath });
    console.log("[Migrate Script] Database deployment finished successfully.", {
      applied: result.applied,
      baseline: result.baseline,
      mode: result.mode,
    });
  } catch (e: unknown) {
    console.error(
      "[Migrate Script] Script failed:",
      e instanceof Error ? e.message : String(e)
    );
    process.exitCode = 1;
  } finally {
    closeDbConnection?.();
    console.log("[Migrate Script] Script execution finished.");
  }
}

runDatabaseDeployment();
