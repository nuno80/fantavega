// src/app/api/leagues/[league-id]/players-with-status/route.ts
// API endpoint to get players with their auction status for a specific league
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// Define interfaces for DB results to avoid 'any'
interface PlayerDBResult {
  id: number;
  role: string;
  roleDetail: string;
  name: string;
  team: string;
  qtA: number;
  qtI: number;
  diff: number;
  qtAM: number;
  qtIM: number;
  diffM: number;
  fvm: number;
  fvmM: number;
  isStarter: number;
  isFavorite: number;
  integrityValue: number;
  hasFmv: number;
  auctionStatus: string;
  auctionId: number | null;
  currentBid: number | null;
  scheduled_end_time: number | null;
  current_highest_bidder_id: string | null;
  currentHighestBidderName: string | null;
  assignedUserId: string | null;
  assignedToTeam: string | null;
  finalPrice: number | null;
  isAssignedToUser: number;
  photo_url: string | null;
}

interface AutoBidDBResult {
  player_id: number;
  max_amount: number;
  is_active: number;
}

interface CooldownDBResult {
  player_id: number;
  expires_at: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const resolvedParams = await params;
    const searchParams = request.nextUrl.searchParams;

    // Pagination params
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Filter params
    const search = searchParams.get("search") || "";
    const roles = searchParams.get("roles")?.split(",") || [];
    const teams = searchParams.get("teams")?.split(",") || [];
    const auctionStatus = searchParams.get("auctionStatus")?.split(",") || [];
    const showAssigned = searchParams.get("showAssigned") !== "false";

    // Preference filters
    const isStarter = searchParams.get("isStarter") === "true";
    const isFavorite = searchParams.get("isFavorite") === "true";
    const hasIntegrity = searchParams.get("hasIntegrity") === "true";
    const hasFmv = searchParams.get("hasFmv") === "true";

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

    // Build WHERE clause dynamically
    const whereConditions: string[] = [];
    const queryArgs: (string | number)[] = [];

    // Base filters
    if (search) {
      whereConditions.push("(p.name LIKE ? OR p.team LIKE ?)");
      queryArgs.push(`%${search}%`, `%${search}%`);
    }

    if (roles.length > 0) {
      whereConditions.push(`p.role IN (${roles.map(() => "?").join(",")})`);
      queryArgs.push(...roles);
    }

    if (teams.length > 0) {
      whereConditions.push(`p.team IN (${teams.map(() => "?").join(",")})`);
      queryArgs.push(...teams);
    }

    // Status filters logic requires joining with auction/assignments,
    // but we can filter on the derived columns if we wrap the query or use HAVING.
    // However, for performance, it's better to filter in the WHERE clause if possible.
    // Since auction status depends on joins, we'll handle it carefully.

    // For simplicity and correctness with SQLite, we will construct the main query
    // and append specific conditions for status if needed, or filter in the main WHERE
    // using EXISTS or LEFT JOIN checks.

    // Let's build the base query parts
    const baseQuery = `
      FROM players p
      LEFT JOIN auctions a ON p.id = a.player_id AND a.auction_league_id = ? AND a.status IN ('active', 'closing')
      LEFT JOIN player_assignments pa ON p.id = pa.player_id AND pa.auction_league_id = ?
      LEFT JOIN users u ON pa.user_id = u.id
      LEFT JOIN users u_bidder ON a.current_highest_bidder_id = u_bidder.id
      LEFT JOIN user_player_preferences upp ON p.id = upp.player_id AND upp.user_id = ? AND upp.league_id = ?
    `;

    // Add leagueId and userId args for the joins
    const joinArgs = [leagueId, leagueId, user.id, leagueId];

    // We need to combine joinArgs and queryArgs correctly.
    // The strategy:
    // 1. Construct the full SQL string with placeholders.
    // 2. Combine all args into a single array.

    // Status filter
    if (auctionStatus.length > 0) {
      const statusConditions: string[] = [];
      if (auctionStatus.includes("assigned")) {
        statusConditions.push("pa.player_id IS NOT NULL");
      }
      if (auctionStatus.includes("active_auction")) {
        statusConditions.push("(a.id IS NOT NULL AND a.status = 'active')");
      }
      if (auctionStatus.includes("no_auction")) {
        statusConditions.push("(pa.player_id IS NULL AND a.id IS NULL)");
      }

      if (statusConditions.length > 0) {
        whereConditions.push(`(${statusConditions.join(" OR ")})`);
      }
    }

    if (!showAssigned && !auctionStatus.includes("assigned")) {
      whereConditions.push("pa.player_id IS NULL");
    }

    // Preference filters
    if (isStarter) whereConditions.push("upp.is_starter = 1");
    if (isFavorite) whereConditions.push("upp.is_favorite = 1");
    if (hasIntegrity) whereConditions.push("upp.integrity_value > 0");
    if (hasFmv) whereConditions.push("upp.has_fmv = 1");


    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    // Count query
    const countSql = `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`;
    const allArgs = [...joinArgs, ...queryArgs];

    const countResult = await db.execute({
      sql: countSql,
      args: allArgs,
    });
    const total = countResult.rows[0].total as number;

    // Data query
    const dataSql = `
      SELECT
          p.id,
          p.role,
          p.role_mantra as roleDetail,
          p.name,
          p.name,
          p.team,
          p.photo_url,
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

      ${baseQuery}
      ${whereClause}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `;

    // Add userId for isAssignedToUser check, then all filter args, then limit/offset
    const dataArgs = [user.id, ...allArgs, limit, offset];

    const playersWithStatusResult = await db.execute({
      sql: dataSql,
      args: dataArgs,
    });
    const playersWithStatus = playersWithStatusResult.rows as unknown as PlayerDBResult[];

    // Get only the current user's auto-bid information for active auctions
    // We can optimize this by only fetching for the player IDs we retrieved
    const playerIds = playersWithStatus.map((p) => p.id);

    let userAutoBidsByPlayer: Record<number, { maxAmount: number; isActive: boolean }> = {};
    let cooldownsByPlayer: Record<number, { expires_at: number }> = {};

    if (playerIds.length > 0) {
      const placeholders = playerIds.map(() => "?").join(",");

      const userAutoBidsResult = await db.execute({
        sql: `SELECT
            a.player_id,
            ab.max_amount,
            ab.is_active
           FROM auto_bids ab
           JOIN auctions a ON ab.auction_id = a.id
           WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = 1 AND a.status = 'active'
           AND a.player_id IN (${placeholders})`,
        args: [leagueId, user.id, ...playerIds],
      });

      userAutoBidsByPlayer = (userAutoBidsResult.rows as unknown as AutoBidDBResult[]).reduce((acc, row) => {
        acc[row.player_id] = {
          maxAmount: row.max_amount,
          isActive: row.is_active === 1,
        };
        return acc;
      }, {} as Record<number, { maxAmount: number; isActive: boolean }>);

      // Fetch cooldowns
      const userCooldownsResult = await db.execute({
        sql: `
          SELECT player_id, expires_at
          FROM user_player_preferences
          WHERE user_id = ? AND league_id = ?
            AND preference_type = 'cooldown' AND expires_at > ?
            AND player_id IN (${placeholders})
        `,
        args: [user.id, leagueId, Math.floor(Date.now() / 1000), ...playerIds],
      });

      cooldownsByPlayer = (userCooldownsResult.rows as unknown as CooldownDBResult[]).reduce((acc, row) => {
        acc[row.player_id] = { expires_at: row.expires_at };
        return acc;
      }, {} as Record<number, { expires_at: number }>);
    }

    // Process players
    const now = Math.floor(Date.now() / 1000);

    const processedPlayers = playersWithStatus.map((player) => {
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

    return NextResponse.json({
      players: processedPlayers,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching players with status:", error);
    return NextResponse.json(
      { error: "Errore nel recupero dei giocatori" },
      { status: 500 }
    );
  }
}
