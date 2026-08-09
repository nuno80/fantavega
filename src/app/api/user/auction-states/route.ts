import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { db } from "@/lib/db";
import { updateHeartbeat } from "@/lib/db/services/session.service";

interface AuctionStateRow {
  auction_id: number;
  player_id: number;
  player_name: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string;
  current_highest_bid_amount: number;
  response_deadline: number | null;
  activated_at: number | null;
  cooldown_ends_at: number | null;
}

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const leagueId = new URL(request.url).searchParams.get("leagueId");
    if (!leagueId) return NextResponse.json({ error: "leagueId is required" }, { status: 400 });
    // Access control: this endpoint shows the user's own auction states (bids, raises,
    // timers) for a league. Only members of the league may read it. Watching other
    // people's auctions for fun is intentionally supported on the league auction-state
    // endpoint (leagues/[league-id]/auction-state), where hasLeagueAccess is also enforced.
    if (!/^\d+$/.test(leagueId)) return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
    const role = typeof user.publicMetadata?.role === "string" ? user.publicMetadata.role : undefined;
    if (!(await hasLeagueAccess(user.id, Number(leagueId), role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
      await updateHeartbeat(user.id);
    } catch (error) {
      console.error("[USER_AUCTION_STATES] Heartbeat update failed:", error);
    }

    const now = Math.floor(Date.now() / 1000);
    const result = await db.execute({ sql: `SELECT a.id as auction_id, a.player_id, p.name as player_name, p.photo_url as player_photo_url, a.current_highest_bidder_id, a.current_highest_bid_amount, urt.response_deadline, urt.activated_at, upp.expires_at as cooldown_ends_at FROM auctions a JOIN players p ON a.player_id = p.id JOIN bids b ON a.id = b.auction_id AND b.user_id = ? LEFT JOIN user_auction_response_timers urt ON a.id = urt.auction_id AND urt.user_id = ? AND urt.status = 'pending' LEFT JOIN user_player_preferences upp ON a.player_id = upp.player_id AND upp.user_id = ? AND upp.league_id = a.auction_league_id AND upp.preference_type = 'cooldown' AND upp.expires_at > ? WHERE a.auction_league_id = ? AND a.status = 'active' GROUP BY a.id`, args: [user.id, user.id, user.id, now, leagueId] });
    const states = (result.rows as unknown as AuctionStateRow[]).map((auction) => {
      const isHighestBidder = auction.current_highest_bidder_id === user.id;
      const isInCooldown = Boolean(auction.cooldown_ends_at && auction.cooldown_ends_at > now);
      return { auction_id: auction.auction_id, player_id: auction.player_id, player_name: auction.player_name, player_photo_url: auction.player_photo_url, current_bid: auction.current_highest_bid_amount, user_state: isInCooldown ? "asta_abbandonata" : isHighestBidder ? "miglior_offerta" : "rilancio_possibile", response_deadline: auction.response_deadline, time_remaining: auction.response_deadline ? Math.max(0, auction.response_deadline - now) : null, is_highest_bidder: isHighestBidder };
    });
    return NextResponse.json({ states, count: states.length });
  } catch (error) {
    console.error("[USER_AUCTION_STATES] API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
