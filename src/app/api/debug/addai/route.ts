import { NextResponse } from "next/server";

import { authorizeDebugRequest } from "@/lib/auth/debug-route";
import { db } from "@/lib/db";

export async function GET() {
  const authorization = await authorizeDebugRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  try {
    const auctionResult = await db.execute({
      sql: `SELECT a.id, a.player_id, p.name, a.current_highest_bidder_id,
                   a.current_highest_bid_amount, a.status, a.user_auction_states,
                   a.auction_league_id
            FROM auctions a
            JOIN players p ON a.player_id = p.id
            WHERE p.name LIKE '%Addai%'
            ORDER BY a.id DESC
            LIMIT 1`,
      args: [],
    });
    const auction = auctionResult.rows[0];
    if (!auction) return NextResponse.json({ error: "No Addai auction found" }, { status: 404 });

    const [timersResult, bidsResult, autoBidsResult] = await Promise.all([
      db.execute({
        sql: `SELECT id, auction_id, user_id, created_at, response_deadline,
                     activated_at, processed_at, status
              FROM user_auction_response_timers
              WHERE auction_id = ? ORDER BY created_at DESC`,
        args: [auction.id],
      }),
      db.execute({
        sql: `SELECT id, auction_id, user_id, amount, bid_time, bid_type
              FROM bids WHERE auction_id = ? ORDER BY bid_time DESC`,
        args: [auction.id],
      }),
      db.execute({
        sql: `SELECT id, auction_id, user_id, is_active, created_at, updated_at
              FROM auto_bids WHERE auction_id = ?`,
        args: [auction.id],
      }),
    ]);

    return NextResponse.json({
      auction,
      timers: timersResult.rows,
      bids: bidsResult.rows,
      autoBids: autoBidsResult.rows,
    });
  } catch (error) {
    console.error("[DEBUG] Addai inspection failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
