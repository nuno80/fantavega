// Debug script to directly investigate auction 1069 and player 5672
// This bypasses authentication to directly check the database state

const Database = require('better-sqlite3');
const path = require('path');

// Connect to the same database the app uses
const dbPath = path.join(__dirname, 'database', 'starter_default.db');

console.log('🔍 Debugging Auction 1069 Detection Issue');
console.log('==========================================');
console.log(`Database path: ${dbPath}`);

try {
  const db = new Database(dbPath, { readonly: true });
  console.log('✅ Connected to database');

  // First, let's check if auction 1069 exists at all
  console.log('\n📊 Step 1: Check if auction 1069 exists');
  const auction1069 = db.prepare('SELECT * FROM auctions WHERE id = 1069').get();
  
  if (auction1069) {
    console.log('✅ Auction 1069 FOUND:', {
      id: auction1069.id,
      player_id: auction1069.player_id,
      auction_league_id: auction1069.auction_league_id,
      status: auction1069.status,
      current_highest_bid_amount: auction1069.current_highest_bid_amount,
      scheduled_end_time: auction1069.scheduled_end_time,
      created_at: auction1069.created_at,
      updated_at: auction1069.updated_at
    });
    
    // Check if it's expired
    const currentTime = Math.floor(Date.now() / 1000);
    const isExpired = auction1069.scheduled_end_time < currentTime;
    const timeRemaining = auction1069.scheduled_end_time - currentTime;
    
    console.log('\n⏰ Time analysis:', {
      currentTime: currentTime,
      scheduledEndTime: auction1069.scheduled_end_time,
      isExpired: isExpired,
      timeRemaining: timeRemaining,
      timeRemainingHours: Math.round(timeRemaining / 3600 * 100) / 100
    });
    
  } else {
    console.log('❌ Auction 1069 NOT FOUND in database');
  }

  // Check all auctions for player 5672
  console.log('\n📊 Step 2: All auctions for player 5672');
  const allAuctionsPlayer5672 = db.prepare(`
    SELECT 
      id, 
      status, 
      current_highest_bid_amount, 
      scheduled_end_time, 
      updated_at,
      (scheduled_end_time - strftime('%s', 'now')) as time_remaining_seconds,
      (CASE WHEN scheduled_end_time < strftime('%s', 'now') THEN 'EXPIRED' ELSE 'VALID' END) as expiry_status
    FROM auctions 
    WHERE player_id = 5672 AND auction_league_id = 1000
    ORDER BY updated_at DESC
  `).all();
  
  console.log(`Found ${allAuctionsPlayer5672.length} auctions for player 5672:`);
  allAuctionsPlayer5672.forEach((auction, index) => {
    console.log(`  [${index}] ID:${auction.id} Status:${auction.status} Bid:${auction.current_highest_bid_amount} EndTime:${auction.scheduled_end_time} ${auction.expiry_status}`);
    if (auction.id === 1069) {
      console.log(`    🎯 THIS IS AUCTION 1069!`);
    }
  });

  // Now let's simulate the exact query our enhanced function uses
  console.log('\n🔍 Step 3: Simulate our enhanced query (active/closing only)');
  const activeQuery = db.prepare(`
    SELECT 
      a.id, a.auction_league_id AS league_id, a.player_id, a.start_time, 
      a.scheduled_end_time, a.current_highest_bid_amount, a.current_highest_bidder_id, 
      a.status, a.created_at, a.updated_at
    FROM auctions a 
    WHERE a.auction_league_id = ? AND a.player_id = ? 
      AND a.status IN ('active', 'closing')
      AND a.scheduled_end_time > strftime('%s', 'now')
    ORDER BY a.updated_at DESC 
    LIMIT 1
  `);
  
  const activeResult = activeQuery.get(1000, 5672);
  console.log('Active/closing query result:', activeResult || 'NO RESULT');
  
  // Let's also check what strftime('%s', 'now') returns
  const sqliteTime = db.prepare("SELECT strftime('%s', 'now') as current_time").get();
  const jsTime = Math.floor(Date.now() / 1000);
  console.log('\n⏰ Time comparison:');
  console.log(`  SQLite time: ${sqliteTime.current_time}`);
  console.log(`  JavaScript time: ${jsTime}`);
  console.log(`  Difference: ${jsTime - sqliteTime.current_time} seconds`);
  
  // Check why auction 1069 might not be returned
  if (auction1069) {
    console.log('\n🔍 Step 4: Why auction 1069 is not returned by active query');
    const currentSQLiteTime = parseInt(sqliteTime.current_time);
    
    console.log('Auction 1069 analysis:');
    console.log(`  Status: ${auction1069.status} (in active/closing?: ${['active', 'closing'].includes(auction1069.status)})`);
    console.log(`  End time: ${auction1069.scheduled_end_time}`);
    console.log(`  Current SQLite time: ${currentSQLiteTime}`);
    console.log(`  Is expired?: ${auction1069.scheduled_end_time <= currentSQLiteTime}`);
    console.log(`  Time remaining: ${auction1069.scheduled_end_time - currentSQLiteTime} seconds`);
    
    if (!['active', 'closing'].includes(auction1069.status)) {
      console.log(`  ❌ ISSUE: Status '${auction1069.status}' is not 'active' or 'closing'`);
    }
    
    if (auction1069.scheduled_end_time <= currentSQLiteTime) {
      console.log(`  ❌ ISSUE: Auction has expired (end time ${auction1069.scheduled_end_time} <= current time ${currentSQLiteTime})`);
    }
    
    if (['active', 'closing'].includes(auction1069.status) && auction1069.scheduled_end_time > currentSQLiteTime) {
      console.log(`  ✅ This auction SHOULD be returned by the query - there might be another issue!`);
    }
  }
  
  console.log('\n📝 Summary:');
  console.log('  - This script directly queries the database to understand why auction detection fails');
  console.log('  - If auction 1069 exists but has wrong status or is expired, that explains the issue');
  console.log('  - If auction 1069 should be active, then there might be a query/logic issue');
  
  db.close();
  console.log('\n✅ Database connection closed');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}