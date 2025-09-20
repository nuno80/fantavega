const Database = require('better-sqlite3');
const path = require('path');

// Use the same database path as the application
const projectRoot = process.cwd();
const dbDir = path.join(projectRoot, "database");
const dbFileName = "starter_default.db";
const dbPath = path.join(dbDir, dbFileName);

console.log(`Attempting to connect to database at: ${dbPath}`);

try {
  const db = new Database(dbPath);
  
  // Check table structure
  console.log('Checking user_sessions table structure:');
  
  const tableInfoStmt = db.prepare(`
    PRAGMA table_info(user_sessions)
  `);

  const tableInfo = tableInfoStmt.all();
  console.log('user_sessions table structure:', JSON.stringify(tableInfo, null, 2));
  
  // Check response timers table structure
  console.log('\nChecking user_auction_response_timers table structure:');
  
  const timersTableInfoStmt = db.prepare(`
    PRAGMA table_info(user_auction_response_timers)
  `);

  const timersTableInfo = timersTableInfoStmt.all();
  console.log('user_auction_response_timers table structure:', JSON.stringify(timersTableInfo, null, 2));
  
  db.close();
} catch (error) {
  console.error('Error:', error);
}