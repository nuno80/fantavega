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
  
  // Check user sessions
  console.log('Checking user sessions:');
  
  const sessionsStmt = db.prepare(`
    SELECT 
      us.user_id,
      u.username,
      us.session_start,
      us.session_end
    FROM user_sessions us
    JOIN users u ON us.user_id = u.id
    WHERE us.user_id IN ('user_2yAf7DnJ7asI88hIP03WtYnzxDL', 'user_305PTUmZvR3qDMx41mZlqJDUVeZ')
    ORDER BY us.session_start DESC
  `);

  const sessions = sessionsStmt.all();
  console.log('User sessions:', JSON.stringify(sessions, null, 2));
  
  // Check the current state of response timers for these users
  console.log('\nChecking response timers:');
  
  const timersStmt = db.prepare(`
    SELECT 
      urt.auction_id,
      urt.user_id,
      u.username,
      urt.response_deadline,
      urt.status,
      urt.created_at,
      urt.activated_at
    FROM user_auction_response_timers urt
    JOIN users u ON urt.user_id = u.id
    WHERE urt.user_id IN ('user_2yAf7DnJ7asI88hIP03WtYnzxDL', 'user_305PTUmZvR3qDMx41mZlqJDUVeZ')
    ORDER BY urt.auction_id, urt.user_id
  `);
  
  const timers = timersStmt.all();
  console.log('Response timers:', JSON.stringify(timers, null, 2));
  
  db.close();
} catch (error) {
  console.error('Error:', error);
}