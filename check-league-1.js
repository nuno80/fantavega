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
  
  const leagueId = 1; // Use league ID 1 as specified
  
  console.log(`Checking all player assignments for league ${leagueId}`);
  
  // Get all player assignments for this league, including those with zero players
  const participantsStmt = db.prepare(`
    SELECT 
      lp.user_id,
      lp.manager_team_name
    FROM league_participants lp
    WHERE lp.league_id = ?
    ORDER BY lp.user_id
  `);

  const participants = participantsStmt.all(leagueId);
  console.log('League participants:', JSON.stringify(participants, null, 2));
  
  // Get player assignments for each participant
  for (const participant of participants) {
    const assignmentsStmt = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.role,
        p.team,
        pa.purchase_price
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = ? AND pa.user_id = ?
      ORDER BY p.role, p.name
    `);

    const assignments = assignmentsStmt.all(leagueId, participant.user_id);
    console.log(`User ${participant.user_id} (${participant.manager_team_name}): ${assignments.length} players`);
    if (assignments.length > 0) {
      console.log(`  Players: ${assignments.map(p => p.name).join(', ')}`);
    }
  }
  
  // Also check the league information
  const leagueInfoStmt = db.prepare(`
    SELECT id, name, status, active_auction_roles
    FROM auction_leagues
    WHERE id = ?
  `);
  
  const leagueInfo = leagueInfoStmt.get(leagueId);
  console.log('League info:', JSON.stringify(leagueInfo, null, 2));
  
  db.close();
} catch (error) {
  console.error('Error:', error);
}