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
  
  console.log(`Checking active auctions for league ${leagueId}`);
  
  // Get all active auctions for this league
  const activeAuctionsStmt = db.prepare(`
    SELECT 
      a.id as auction_id,
      a.player_id,
      p.name as player_name,
      p.role as player_role,
      p.team as player_team,
      a.current_highest_bidder_id,
      a.current_highest_bid_amount,
      a.scheduled_end_time,
      a.status
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ? AND a.status = 'active'
    ORDER BY a.scheduled_end_time
  `);

  const activeAuctions = activeAuctionsStmt.all(leagueId);
  console.log('Active auctions:', JSON.stringify(activeAuctions, null, 2));
  
  // Check if there are any auctions at all (not just active)
  const allAuctionsStmt = db.prepare(`
    SELECT 
      a.id as auction_id,
      a.player_id,
      p.name as player_name,
      a.current_highest_bidder_id,
      a.current_highest_bid_amount,
      a.status
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ?
    ORDER BY a.id
  `);

  const allAuctions = allAuctionsStmt.all(leagueId);
  console.log('All auctions:', JSON.stringify(allAuctions, null, 2));
  
  // Check bids for these auctions
  if (allAuctions.length > 0) {
    console.log('\nChecking bids for auctions:');
    for (const auction of allAuctions) {
      const bidsStmt = db.prepare(`
        SELECT 
          b.user_id,
          u.username,
          b.amount,
          b.bid_type,
          b.timestamp
        FROM bids b
        JOIN users u ON b.user_id = u.id
        WHERE b.auction_id = ?
        ORDER BY b.amount DESC, b.timestamp ASC
      `);
      
      const bids = bidsStmt.all(auction.auction_id);
      console.log(`Auction ${auction.auction_id} (${auction.player_name}):`, JSON.stringify(bids, null, 2));
    }
  }
  
  db.close();
} catch (error) {
  console.error('Error:', error);
}