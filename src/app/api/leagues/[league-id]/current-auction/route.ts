// src/app/api/leagues/[league-id]/current-auction/route.ts
// API endpoint to get current active auction for a league
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { getAuctionStatusForPlayer } from "@/lib/db/services/bid.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);

    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Verify user is participant in this league
    const participation = db
      .prepare(
        "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?"
      )
      .get(leagueId, user.id);

    if (!participation) {
      return NextResponse.json(
        { error: "Non autorizzato per questa lega" },
        { status: 403 }
      );
    }

    // Get current active auction
    const activeAuction = db
      .prepare(
        `SELECT 
          a.id,
          a.player_id,
          a.current_highest_bid_amount,
          a.current_highest_bidder_id,
          a.scheduled_end_time,
          a.status,
          p.name as player_name,
          p.role as player_role
         FROM auctions a
         JOIN players p ON a.player_id = p.id
         WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing')
         ORDER BY a.created_at DESC
         LIMIT 1`
      )
      .get(leagueId) as
      | {
          id: number;
          player_id: number;
          current_highest_bid_amount: number;
          current_highest_bidder_id: string | null;
          scheduled_end_time: number;
          status: string;
          player_name: string;
          player_role: string;
        }
      | undefined;

    if (!activeAuction) {
      return NextResponse.json(null); // No active auction
    }

    // Get detailed auction status using existing service
    const auctionDetails = await getAuctionStatusForPlayer(
      leagueId,
      activeAuction.player_id
    );

    return NextResponse.json(auctionDetails);
  } catch (error) {
    console.error("Error fetching current auction:", error);
    return NextResponse.json(
      { error: "Errore nel recupero dell'asta corrente" },
      { status: 500 }
    );
  }
}
