// src/lib/db/reset.ts
import { closeDbConnection, db as currentDbInstance } from "@/lib/db";
import fs from "fs-extra";
import path from "path";
import { createBackup } from "./backup-utils";

const projectRoot = process.cwd();
const dbDir = path.join(projectRoot, "database");
const dbName = "starter_default.db";
const dbPath = path.join(dbDir, dbName);

async function resetDatabase() {
  console.log(`[Reset Script] Attempting to reset database...`);

  const isRemote =
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;

  if (isRemote) {
    console.warn(
      "[Reset Script] WARNING: You are configured to use a Remote Turso Database."
    );
    console.warn(
      "[Reset Script] This script currently only supports resetting LOCAL SQLite files by deletion."
    );
    console.warn(
      "[Reset Script] To reset your Turso database, please drop all tables manually or use the Turso CLI/Dashboard."
    );
    console.warn("[Reset Script] Operation aborted for safety.");
    return;
  }

  console.log(`[Reset Script] Target local DB: ${dbPath}`);

  try {
    await createBackup("pre-reset");
  } catch (backupError) {
    console.warn(
      "[Reset Script] Failed to create backup before reset. Continuing with caution.",
      backupError
    );
  }

  if (currentDbInstance) {
    console.log("[Reset Script] Closing existing database connection...");
    closeDbConnection();
  }
  await new Promise((resolve) => setTimeout(resolve, 300)); // Pausa

  console.log("[Reset Script] Deleting old database files (if they exist)...");
  try {
    if (await fs.pathExists(dbPath)) await fs.remove(dbPath);
    if (await fs.pathExists(`${dbPath}-shm`)) await fs.remove(`${dbPath}-shm`);
    if (await fs.pathExists(`${dbPath}-wal`)) await fs.remove(`${dbPath}-wal`);
    console.log(
      `[Reset Script] Database files for "${dbName}" deleted or did not exist.`
    );
  } catch (deleteError) {
    console.error(
      "[Reset Script] Error deleting old database files:",
      deleteError
    );
    process.exit(1);
  }

  console.log("\n[Reset Script] Database has been reset.");
  console.log(
    // prettier-ignore
    "IMPORTANT: Run \"pnpm run db:migrate\" to re-apply the schema to the new empty database.\n"
  );
}

resetDatabase().catch((e) => {
  console.error("[Reset Script] Unhandled error during database reset:", e);
  process.exit(1);
});
