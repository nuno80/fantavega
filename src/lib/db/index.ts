import { createClient, type Client } from "@libsql/client";
import path from "path";

// Declare global variable for development singleton
declare global {
  // eslint-disable-next-line no-var
  var __db_client: Client | undefined;
}

const projectRoot = process.cwd();
// const dbPath = path.join(process.cwd(), "database", "starter_default.db");FileName = "starter_default.db";
const dbDir = path.join(projectRoot, "database");
const dbFileName = "starter_default.db";
const _dbPath = path.join(dbDir, dbFileName); // Prefixed with underscore as it's unused

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
    // For local development with @libsql/client, we use the file: protocol
    // Note: @libsql/client 'file:' url requires the 'better-sqlite3' package to be installed as a peer dependency.
    // Since we removed better-sqlite3, we should only support remote Turso connection in production or if configured.
    // However, for local dev without Turso, we might still need a local file.
    // But the user requirement was "Turso-only configuration" and "remove better-sqlite3".
    // If we remove better-sqlite3, we CANNOT use file: protocol with @libsql/client in Node.js environment usually, unless we use the pure JS implementation or similar?
    // Actually @libsql/client for Node.js uses better-sqlite3 under the hood for file: URLs.
    // If the user wants "Turso-only", we should throw an error if no credentials are provided, OR assume we are always connecting to Turso.

    // Let's assume we MUST have Turso credentials.
    console.warn("[DB Connection] No Turso credentials found. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
    throw new Error("Turso credentials missing. Local file fallback is disabled.");
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
