import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { activateResponseTimerForViewedAuction } from "@/lib/db/services/response-timer-view.service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ "league-id": string; "auction-id": string }> },
) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { "league-id": rawLeagueId, "auction-id": rawAuctionId } = await params;
  if (!/^\d+$/.test(rawLeagueId) || !/^\d+$/.test(rawAuctionId)) {
    return NextResponse.json({ error: "Invalid league or auction ID" }, { status: 400 });
  }
  const leagueId = Number(rawLeagueId);
  const auctionId = Number(rawAuctionId);
  const role = typeof user.publicMetadata?.role === "string" ? user.publicMetadata.role : undefined;
  if (!(await hasLeagueAccess(user.id, leagueId, role))) {
    return NextResponse.json({ error: "League access denied" }, { status: 403 });
  }

  const result = await activateResponseTimerForViewedAuction(user.id, leagueId, auctionId);
  return NextResponse.json(result, { status: result.status === "not_found" ? 404 : 200 });
}
