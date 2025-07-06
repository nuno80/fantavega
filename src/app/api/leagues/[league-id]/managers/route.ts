// src/app/api/leagues/[league-id]/managers/route.ts
// API endpoint to get all managers in a league with their rosters

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
}

interface Manager {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
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
    const participantCheck = db
      .prepare("SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?")
      .get(leagueId, user.id);

    if (!participantCheck) {
      return NextResponse.json({ error: "Not a participant in this league" }, { status: 403 });
    }

    // Get league slots configuration and managers
    const leagueInfoStmt = db.prepare(`
      SELECT 
        slots_P,
        slots_D,
        slots_C,
        slots_A
      FROM auction_leagues
      WHERE id = ?
    `);

    const leagueSlots = leagueInfoStmt.get(leagueId) as LeagueSlots;

    // Get all managers/participants in the league
    const managersStmt = db.prepare(`
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
    `);

    const managers = managersStmt.all(leagueId) as Omit<Manager, 'players' | 'firstName' | 'lastName'>[];

    // Get active auctions with current bid amounts
    const activeAuctionsStmt = db.prepare(`
      SELECT 
        a.player_id,
        p.name as player_name,
        p.role as player_role,
        p.team as player_team,
        a.current_highest_bidder_id,
        a.current_highest_bid_amount,
        a.scheduled_end_time
      FROM auctions a
      JOIN players p ON a.player_id = p.id
      WHERE a.auction_league_id = ? AND a.status = 'active'
    `);

    const activeAuctions = activeAuctionsStmt.all(leagueId) as ActiveAuction[];

    // Get auto bids for all active auctions
    const autoBidsStmt = db.prepare(`
      SELECT 
        a.player_id,
        ab.user_id,
        ab.max_amount as max_bid_amount
      FROM auto_bids ab
      JOIN auctions a ON ab.auction_id = a.id
      WHERE a.auction_league_id = ? AND a.status = 'active' AND ab.is_active = 1
    `);

    const autoBids = autoBidsStmt.all(leagueId) as {player_id: number, user_id: string, max_bid_amount: number}[];

    // Get players for each manager
    const playersStmt = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.role,
        p.team,
        pa.purchase_price as assignment_price
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = ? AND pa.user_id = ?
      ORDER BY p.role, p.name
    `);

    // Build the complete managers data with their rosters
    const managersWithRosters: Manager[] = managers.map(manager => ({
      ...manager,
      players: playersStmt.all(leagueId, manager.user_id) as PlayerInRoster[]
    }));

    return NextResponse.json({
      managers: managersWithRosters,
      leagueSlots,
      activeAuctions,
      autoBids
    }, { status: 200 });

  } catch (error) {
    console.error("[API] Error fetching managers:", error);
    return NextResponse.json(
      { error: "Failed to fetch managers" },
      { status: 500 }
    );
  }
}