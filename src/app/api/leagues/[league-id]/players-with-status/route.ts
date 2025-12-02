// src/app/api/leagues/[league-id]/players-with-status/route.ts
// API endpoint to get players with their auction status for a specific league
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const resolvedParams = await params;

    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const leagueId = parseInt(resolvedParams["league-id"]);

    if (isNaN(leagueId)) {
      return NextResponse.json(
        { error: "ID lega non valido" },
        { status: 400 }
      );
    }

    // Verify user is participant in this league
    const participationResult = await db.execute({
      sql: "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, user.id],
    });
    const participation = participationResult.rows[0];

    if (!participation) {
      return NextResponse.json(
        { error: "Non autorizzato per questa lega" },
        { status: 403 }
      );
    }

    // Get all players with their auction status and user preferences
    const playersWithStatusResult = await db.execute({
      sql: `SELECT
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

          -- User preferences
          COALESCE(upp.is_starter, 0) as isStarter,
          COALESCE(upp.is_favorite, 0) as isFavorite,
          COALESCE(upp.integrity_value, 0) as integrityValue,
          COALESCE(upp.has_fmv, 0) as hasFmv,

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
          CASE WHEN pa.user_id = ? THEN 1 ELSE 0 END as isAssignedToUser

         FROM players p
         LEFT JOIN auctions a ON p.id = a.player_id AND a.auction_league_id = ? AND a.status IN ('active', 'closing')
         LEFT JOIN player_assignments pa ON p.id = pa.player_id AND pa.auction_league_id = ?
         LEFT JOIN users u ON pa.user_id = u.id
         LEFT JOIN users u_bidder ON a.current_highest_bidder_id = u_bidder.id
         LEFT JOIN user_player_preferences upp ON p.id = upp.player_id AND upp.user_id = ? AND upp.league_id = ?
         ORDER BY p.name ASC`,
      args: [user.id, leagueId, leagueId, user.id, leagueId],
    });
    const playersWithStatus = playersWithStatusResult.rows;

    // Get only the current user's auto-bid information for active auctions
    const userAutoBidsResult = await db.execute({
      sql: `SELECT
          a.player_id,
          ab.max_amount,
          ab.is_active
         FROM auto_bids ab
         JOIN auctions a ON ab.auction_id = a.id
         WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = 1 AND a.status = 'active'`,
      args: [leagueId, user.id],
    });
    const userAutoBidsData = userAutoBidsResult.rows;

    // Create a map of user's auto-bids by player ID
    interface UserAutoBid {
      maxAmount: number;
      isActive: boolean;
    }

    interface UserAutoBidsByPlayer {
      [key: number]: UserAutoBid;
    }

    const userAutoBidsByPlayer = (
      userAutoBidsData as unknown as Array<{
        player_id: number;
        max_amount: number;
        is_active: number;
      }>
    ).reduce((acc: UserAutoBidsByPlayer, autoBid) => {
      acc[autoBid.player_id] = {
        maxAmount: autoBid.max_amount,
        isActive: autoBid.is_active === 1,
      };
      return acc;
    }, {});

    // 1. Fetch all active cooldowns for the user in this league in a single query
    const userCooldownsResult = await db.execute({
      sql: `
        SELECT player_id, expires_at
        FROM user_player_preferences
        WHERE user_id = ? AND league_id = ?
          AND preference_type = 'cooldown' AND expires_at > ?
      `,
      args: [user.id, leagueId, Math.floor(Date.now() / 1000)],
    });

    interface CooldownData {
      expires_at: number;
    }

    const cooldownsByPlayer = (
      userCooldownsResult.rows as unknown as Array<{
        player_id: number;
        expires_at: number;
      }>
    ).reduce((acc: { [key: number]: CooldownData }, row) => {
      acc[row.player_id] = { expires_at: row.expires_at };
      return acc;
    }, {});

    // Calculate time remaining for active auctions and add user's auto-bid info and cooldown info
    const now = Math.floor(Date.now() / 1000);

    // No longer async map since we have all data in memory
    const processedPlayers = (
      playersWithStatus as unknown as Array<{
        id: number;
        scheduled_end_time?: number;
        [key: string]: unknown;
      }>
    ).map((player) => {
      // Check cooldown from memory map instead of DB
      const cooldown = cooldownsByPlayer[player.id];
      let cooldownInfo: { timeRemaining: number; message: string } | null = null;

      if (cooldown) {
        const timeRemaining = cooldown.expires_at - now;
        if (timeRemaining > 0) {
          const hours = Math.floor(timeRemaining / 3600);
          const minutes = Math.floor((timeRemaining % 3600) / 60);
          cooldownInfo = {
            timeRemaining,
            message: `Hai abbandonato l'asta per questo giocatore! Riprova tra ${hours}h ${minutes}m`
          };
        }
      }

      return {
        ...player,
        timeRemaining: player.scheduled_end_time
          ? Math.max(0, player.scheduled_end_time - now)
          : undefined,
        userAutoBid: userAutoBidsByPlayer[player.id] || null,
        cooldownInfo
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
