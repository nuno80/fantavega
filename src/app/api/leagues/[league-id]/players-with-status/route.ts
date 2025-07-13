// src/app/api/leagues/[league-id]/players-with-status/route.ts
// API endpoint to get players with their auction status for a specific league

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getUserCooldownInfo } from "@/lib/db/services/response-timer.service";

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
      return NextResponse.json({ error: "ID lega non valido" }, { status: 400 });
    }

    // Verify user is participant in this league
    const participation = db
      .prepare("SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?")
      .get(leagueId, user.id);

    if (!participation) {
      return NextResponse.json({ error: "Non autorizzato per questa lega" }, { status: 403 });
    }

    // Get all players with their auction status
    const playersWithStatus = db
      .prepare(
        `SELECT 
          p.id,
          p.role,
          p.role_mantra as roleDetail,
          p.name,
          p.team,
          p.current_quotation as qtA,
          p.initial_quotation as qtI,
          (p.current_quotation - p.initial_quotation) as diff,
          p.current_quotation_mantra as qtAM,
          p.initial_quotation_mantra as qtIM,
          (p.current_quotation_mantra - p.initial_quotation_mantra) as diffM,
          p.fvm,
          p.fvm_mantra as fvmM,
          
          -- Auction status
          CASE 
            WHEN pa.player_id IS NOT NULL THEN 'assigned'
            WHEN a.id IS NOT NULL AND a.status = 'active' THEN 'active_auction'
            ELSE 'no_auction'
          END as auctionStatus,
          
          -- Auction details
          a.id as auctionId,
          a.current_highest_bid_amount as currentBid,
          a.scheduled_end_time,
          a.current_highest_bidder_id,
          u_bidder.username as currentHighestBidderName,
          
          -- Assignment details
          pa.user_id as assignedUserId,
          u.username as assignedToTeam,
          pa.purchase_price as finalPrice,
          
          -- User-specific info
          CASE WHEN pa.user_id = ? THEN 1 ELSE 0 END as isAssignedToUser,
          
          -- Can start auction (for admins)
          CASE WHEN pa.player_id IS NULL AND a.id IS NULL THEN 1 ELSE 0 END as canStartAuction
          
         FROM players p
         LEFT JOIN auctions a ON p.id = a.player_id AND a.auction_league_id = ? AND a.status IN ('active', 'closing')
         LEFT JOIN player_assignments pa ON p.id = pa.player_id AND pa.auction_league_id = ?
         LEFT JOIN users u ON pa.user_id = u.id
         LEFT JOIN users u_bidder ON a.current_highest_bidder_id = u_bidder.id
         ORDER BY p.name ASC`
      )
      .all(user.id, leagueId, leagueId);

    // Get only the current user's auto-bid information for active auctions
    const userAutoBidsData = db
      .prepare(
        `SELECT 
          a.player_id,
          ab.max_amount,
          ab.is_active
         FROM auto_bids ab
         JOIN auctions a ON ab.auction_id = a.id
         WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = 1 AND a.status = 'active'`
      )
      .all(leagueId, user.id);

    // Create a map of user's auto-bids by player ID
    interface UserAutoBid {
      maxAmount: number;
      isActive: boolean;
    }
    
    interface UserAutoBidsByPlayer {
      [key: number]: UserAutoBid;
    }

    const userAutoBidsByPlayer = (userAutoBidsData as any[]).reduce((acc: UserAutoBidsByPlayer, autoBid) => {
      acc[autoBid.player_id] = {
        maxAmount: autoBid.max_amount,
        isActive: autoBid.is_active === 1
      };
      return acc;
    }, {});

    // Calculate time remaining for active auctions and add user's auto-bid info and cooldown info
    const now = Math.floor(Date.now() / 1000);
    const processedPlayers = (playersWithStatus as any[]).map((player) => {
      const cooldownInfo = getUserCooldownInfo(user.id, player.id);
      return {
        ...player,
        timeRemaining: player.scheduled_end_time 
          ? Math.max(0, player.scheduled_end_time - now)
          : undefined,
        userAutoBid: userAutoBidsByPlayer[player.id] || null,
        cooldownInfo: cooldownInfo.canBid ? null : {
          timeRemaining: cooldownInfo.timeRemaining,
          message: cooldownInfo.message
        }
      };
    });

    return NextResponse.json(processedPlayers);
  } catch (error) {
    console.error("Error fetching players with status:", error);
    return NextResponse.json(
      { error: "Errore nel recupero dei giocatori" },
      { status: 500 }
    );
  }
}
