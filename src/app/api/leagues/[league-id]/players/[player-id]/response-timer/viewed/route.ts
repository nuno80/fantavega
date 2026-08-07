import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { db } from "@/lib/db";
import { activateResponseTimerForViewedAuction } from "@/lib/db/services/response-timer-view.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ "league-id": string; "player-id": string }> },
) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { "league-id": rawLeagueId, "player-id": rawPlayerId } = await params;
  if (!/^\d+$/.test(rawLeagueId) || !/^\d+$/.test(rawPlayerId)) {
    return NextResponse.json({ error: "Invalid league or player ID" }, { status: 400 });
  }
  const leagueId = Number(rawLeagueId);
  const playerId = Number(rawPlayerId);
  const role = typeof user.publicMetadata?.role === "string" ? user.publicMetadata.role : undefined;
  if (!(await hasLeagueAccess(user.id, leagueId, role))) {
    return NextResponse.json({ error: "League access denied" }, { status: 403 });
  }

  const auction = await db.execute({
    sql: "SELECT id FROM auctions WHERE auction_league_id = ? AND player_id = ? AND status = 'active' LIMIT 1",
    args: [leagueId, playerId],
  });
  const auctionId = auction.rows[0]?.id;
  if (auctionId === undefined) return NextResponse.json({ error: "Active auction not found" }, { status: 404 });

  const result = await activateResponseTimerForViewedAuction(user.id, leagueId, Number(auctionId));
  return NextResponse.json(result, { status: result.status === "not_found" ? 404 : 200 });
}
