// Script di debug per verificare lo stato dell'asta Addai
import { db } from './src/lib/db/index.js';

async function checkAddaiAuction() {
  console.log('🔍 Checking Addai auction...\n');

  // 1. Find Addai auction
  const auctionResult = await db.execute({
    sql: `
      SELECT a.id, a.player_id, p.name, a.current_highest_bidder_id,
             a.current_highest_bid_amount, a.status, a.user_auction_states,
             a.auction_league_id
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      WHERE p.name LIKE '%Addai%'
      ORDER BY a.id DESC
      LIMIT 1
    `
  });

  if (auctionResult.rows.length === 0) {
    console.log('❌ No Addai auction found');
    return;
  }

  const auction = auctionResult.rows[0];
  console.log('📋 Auction Details:');
  console.log(JSON.stringify(auction, null, 2));
  console.log('\n');

  // 2. Check response timers
  const timersResult = await db.execute({
    sql: `
      SELECT * FROM user_auction_response_timers
      WHERE auction_id = ?
      ORDER BY created_at DESC
    `,
    args: [auction.id]
  });

  console.log('⏱️  Response Timers:');
  console.log(JSON.stringify(timersResult.rows, null, 2));
  console.log('\n');

  // 3. Check all bids
  const bidsResult = await db.execute({
    sql: `
      SELECT b.*, u.email
      FROM bids b
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.auction_id = ?
      ORDER BY b.bid_time DESC
    `,
    args: [auction.id]
  });

  console.log('💰 All Bids:');
  console.log(JSON.stringify(bidsResult.rows, null, 2));
  console.log('\n');

  // 4. Check auto-bids
  const autoBidsResult = await db.execute({
    sql: `
      SELECT * FROM auto_bids
      WHERE auction_id = ?
    `,
    args: [auction.id]
  });

  console.log('🤖 Auto-Bids:');
  console.log(JSON.stringify(autoBidsResult.rows, null, 2));
  console.log('\n');

  // 5. Check user auction states for the league
  const statesResult = await db.execute({
    sql: `
      SELECT uas.*, p.name as player_name
      FROM user_auction_states uas
      JOIN auctions a ON uas.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE a.auction_league_id = ?
      ORDER BY uas.created_at DESC
    `,
    args: [auction.auction_league_id]
  });

  console.log('📊 User Auction States (League):');
  console.log(JSON.stringify(statesResult.rows, null, 2));
}

checkAddaiAuction()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
