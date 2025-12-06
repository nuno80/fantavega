// API route per debug Addai auction
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
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
      return NextResponse.json({ error: 'No Addai auction found' });
    }

    const auction = auctionResult.rows[0];

    // 2. Check response timers
    const timersResult = await db.execute({
      sql: `
        SELECT * FROM user_auction_response_timers
        WHERE auction_id = ?
        ORDER BY created_at DESC
      `,
      args: [auction.id]
    });

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

    // 4. Check auto-bids
    const autoBidsResult = await db.execute({
      sql: `
        SELECT * FROM auto_bids
        WHERE auction_id = ?
      `,
      args: [auction.id]
    });

    return NextResponse.json({
      auction,
      timers: timersResult.rows,
      bids: bidsResult.rows,
      autoBids: autoBidsResult.rows
    }, { status: 200 });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
