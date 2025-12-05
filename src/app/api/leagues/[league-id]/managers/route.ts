// src/app/api/leagues/[league-id]/managers/route.ts
// API endpoint to get all managers in a league with their rosters
// Updated: 2024-12-04 - Added photo_url support
import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
  photo_url?: string | null;
}

interface Manager {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
  total_penalties: number;
  firstName?: string;
  lastName?: string;
  players: PlayerInRoster[];
}

interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

interface ActiveAuction {
  player_id: number;
  player_name: string;
  player_role: string;
  player_team: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string | null;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const leagueId = parseInt(resolvedParams["league-id"]);
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    // Check if user is participant in this league
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, user.id],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    if (!participantCheck) {
      return NextResponse.json(
        { error: "Not a participant in this league" },
        { status: 403 }
      );
    }

    // Get league slots configuration and managers
    const leagueSlotsResult = await db.execute({
      sql: `
        SELECT
          slots_P,
          slots_D,
          slots_C,
          slots_A,
          status
        FROM auction_leagues
        WHERE id = ?
      `,
      args: [leagueId],
    });

    const leagueRow = leagueSlotsResult.rows[0] as unknown as LeagueSlots & { status: string };
    const leagueSlots: LeagueSlots = {
      slots_P: leagueRow.slots_P,
      slots_D: leagueRow.slots_D,
      slots_C: leagueRow.slots_C,
      slots_A: leagueRow.slots_A,
    };
    const leagueStatus = leagueRow.status;

    // Get all managers/participants in the league
    const managersResult = await db.execute({
      sql: `
        SELECT
          lp.user_id,
          lp.manager_team_name,
          lp.current_budget,
          lp.locked_credits,
          al.initial_budget_per_manager as total_budget
        FROM league_participants lp
        JOIN auction_leagues al ON lp.league_id = al.id
        WHERE lp.league_id = ?
        ORDER BY lp.manager_team_name ASC, lp.user_id ASC
      `,
      args: [leagueId],
    });

    const managers = managersResult.rows as unknown as Omit<
      Manager,
      "players" | "firstName" | "lastName" | "total_penalties"
    >[];

    // Get total penalties for each manager
    const penaltiesResult = await db.execute({
      sql: `
        SELECT
          user_id,
          COALESCE(SUM(amount), 0) as total_penalties
        FROM budget_transactions
        WHERE auction_league_id = ? AND transaction_type = 'penalty_requirement'
        GROUP BY user_id
      `,
      args: [leagueId],
    });

    const penaltiesData = penaltiesResult.rows as unknown as {
      user_id: string;
      total_penalties: number;
    }[];

    // Maximum penalty limit enforcement
    const MAX_TOTAL_PENALTY_CREDITS = 25;

    // Create a map for quick penalty lookup with maximum limit enforcement
    const penaltiesByUser = new Map<string, number>();
    for (const penalty of penaltiesData) {
      // Enforce maximum penalty limit in display (should not exceed 25 credits)
      const limitedPenalties = Math.min(
        penalty.total_penalties,
        MAX_TOTAL_PENALTY_CREDITS
      );
      penaltiesByUser.set(penalty.user_id, limitedPenalties);
    }

    // Get active auctions with current bid amounts
    const activeAuctionsResult = await db.execute({
      sql: `
        SELECT
          a.player_id,
          p.name as player_name,
          p.role as player_role,
          p.team as player_team,
          p.photo_url as player_photo_url,
          a.current_highest_bidder_id,
          a.current_highest_bid_amount,
          a.scheduled_end_time
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ? AND a.status = 'active'
      `,
      args: [leagueId],
    });

    const activeAuctions = activeAuctionsResult.rows as unknown as ActiveAuction[];

    // Get auto bid indicators for all active auctions (without revealing amounts)
    const autoBidsResult = await db.execute({
      sql: `
        SELECT
          a.player_id,
          COUNT(ab.user_id) as auto_bid_count
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        WHERE a.auction_league_id = ? AND a.status = 'active' AND ab.is_active = 1
        GROUP BY a.player_id
      `,
      args: [leagueId],
    });

    const autoBids = autoBidsResult.rows as unknown as {
      player_id: number;
      auto_bid_count: number;
    }[];

    // Get all players for the league in one go
    const allPlayersResult = await db.execute({
      sql: `
        SELECT
          pa.user_id,
          p.id,
          p.name,
          p.role,
          p.team,
          p.photo_url,
          pa.purchase_price as assignment_price
        FROM player_assignments pa
        JOIN players p ON pa.player_id = p.id
        WHERE pa.auction_league_id = ?
        ORDER BY p.role, p.name
      `,
      args: [leagueId],
    });

    const allPlayersInLeague = allPlayersResult.rows as unknown as (PlayerInRoster & { user_id: string })[];

    // DEBUG: Log first player to check if photo_url is present in DB result
    /*
    if (allPlayersInLeague.length > 0) {
      console.log("[API] First player from DB:", JSON.stringify(allPlayersInLeague[0], null, 2));
    }
    */

    // Group players by manager
    const playersByManager = new Map<string, PlayerInRoster[]>();
    for (const player of allPlayersInLeague) {
      if (!playersByManager.has(player.user_id)) {
        playersByManager.set(player.user_id, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      playersByManager.get(player.user_id)!.push({
        id: player.id,
        name: player.name,
        role: player.role,
        team: player.team,
        assignment_price: player.assignment_price,
        photo_url: player.photo_url,
      });
    }

    // Build the complete managers data with their correct rosters
    const managersWithRosters: Manager[] = managers.map((manager) => ({
      ...manager,
      total_penalties: penaltiesByUser.get(manager.user_id) || 0,
      players: playersByManager.get(manager.user_id) || [],
      // Sanitize locked_credits for other users to prevent data leaks
      locked_credits: manager.user_id === user.id ? manager.locked_credits : 0,
    }));

    return NextResponse.json(
      {
        managers: managersWithRosters,
        leagueSlots,
        activeAuctions,
        autoBids,
        leagueStatus,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error("[API] Error fetching managers:", error);
    return NextResponse.json(
      { error: "Failed to fetch managers" },
      { status: 500 }
    );
  }
}
