import { createClient, type Client } from "@libsql/client";
import path from "path";

// Declare global variable for development singleton
declare global {
  // eslint-disable-next-line no-var
  var __db_client: Client | undefined;
}

const projectRoot = process.cwd();
const dbDir = path.join(projectRoot, "database");
const dbFileName = "starter_default.db";
const dbPath = path.join(dbDir, dbFileName);

/**
 * Initializes the database client.
 * Uses local file in development/if no Turso creds.
 * Uses Turso remote if credentials are provided.
 */
function initializeDatabaseClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url && authToken) {
    console.log("[DB Connection] Initializing Turso (Remote) connection...");
    return createClient({
      url,
      authToken,
    });
  } else {
    console.log(
      `[DB Connection] Initializing Local SQLite connection at ${dbPath}...`
    );
    // For local development with @libsql/client, we use the file: protocol
    // Note: @libsql/client 'file:' url requires the 'better-sqlite3' package to be installed as a peer dependency, which we have.
    return createClient({
      url: `file:${dbPath}`,
    });
  }
}

let db: Client;

if (process.env.NODE_ENV === "production") {
  db = initializeDatabaseClient();
} else {
  if (!global.__db_client) {
    global.__db_client = initializeDatabaseClient();
  }
  db = global.__db_client;
}

export const closeDbConnection = () => {
  if (global.__db_client) {
    console.log("[DB Connection] Closing DEV singleton database connection.");
    global.__db_client.close();
    global.__db_client = undefined;
  } else if (db) {
    console.log("[DB Connection] Closing database connection.");
    db.close();
  }
};

export { db };
