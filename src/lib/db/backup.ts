// src/lib/db/backup.ts
import { closeDbConnection, db } from "@/lib/db";
import { createBackup } from "./backup-utils";

async function runManualBackup() {
  const isRemote =
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;

  if (isRemote) {
    console.warn(
      "[Manual Backup CLI] WARNING: You are configured to use a Remote Turso Database."
    );
    console.warn(
      "[Manual Backup CLI] This script currently only supports backing up LOCAL SQLite files."
    );
    console.warn(
      "[Manual Backup CLI] To backup your Turso database, please use the Turso CLI/Dashboard."
    );
    return;
  }

  // È una buona pratica chiudere la connessione al DB prima di fare un backup del file,
  // specialmente se la modalità WAL è attiva, per assicurare la consistenza.
  if (db) {
    console.log(
      "[Manual Backup CLI] Closing database connection before backup..."
    );
    closeDbConnection();
    // Piccola pausa per assicurare che i file -wal e -shm siano finalizzati se possibile
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    const backupPath = await createBackup("manual_cli_invocation");
    if (backupPath) {
      console.log(
        `[Manual Backup CLI] Manual backup completed successfully: ${backupPath}`
      );
    } else {
      console.log(
        "[Manual Backup CLI] Backup not created (database file might not exist)."
      );
    }
  } catch (error) {
    console.error("[Manual Backup CLI] Manual backup process failed:", error);
    process.exit(1);
  }
}

runManualBackup();
