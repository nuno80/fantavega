import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leagueId = url.searchParams.get("leagueId");

    if (!leagueId) {
      return NextResponse.json({ error: "leagueId required" }, { status: 400 });
    }

    // Fetch all active auctions in the league
    const activeAuctionsResult = await db.execute({
      sql: `
        SELECT
          a.id as auction_id,
          a.player_id,
          p.name as player_name,
          a.current_highest_bidder_id,
          a.current_highest_bid_amount
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ? AND a.status = 'active'
      `,
      args: [leagueId],
    });
    const activeAuctions = activeAuctionsResult.rows as unknown as Array<{
      auction_id: number;
      player_id: number;
      player_name: string;
      current_highest_bidder_id: string | null;
      current_highest_bid_amount: number;
    }>;

    // Fetch all participants (managers) in the league
    const leagueParticipantsResult = await db.execute({
      sql: `
        SELECT user_id FROM league_participants WHERE league_id = ?
      `,
      args: [leagueId],
    });
    const leagueParticipants = leagueParticipantsResult.rows as unknown as Array<{ user_id: string }>;

    // Fetch all relevant response timers for active auctions in this league, for all users
    const allResponseTimersResult = await db.execute({
      sql: `
        SELECT
          urt.auction_id,
          urt.user_id,
          urt.response_deadline,
          urt.activated_at,
          urt.status
        FROM user_auction_response_timers urt
        JOIN auctions a ON urt.auction_id = a.id
        WHERE a.auction_league_id = ? AND a.status = 'active'
      `,
      args: [leagueId],
    });
    const allResponseTimers = allResponseTimersResult.rows as unknown as Array<{
      auction_id: number;
      user_id: string;
      response_deadline: number | null;
      activated_at: number | null;
      status: string;
    }>;

    const now = Math.floor(Date.now() / 1000);
    const states: Array<{
      auction_id: number;
      player_id: number;
      user_id: string;
      player_name: string;
      current_bid: number;
      user_state: "miglior_offerta" | "rilancio_possibile" | "asta_abbandonata";
      response_deadline: number | null;
      time_remaining: number | null;
      is_highest_bidder: boolean;
    }> = [];

    // Iterate through each active auction
    for (const auction of activeAuctions) {
      // For each auction, iterate through each manager to determine their state
      for (const participant of leagueParticipants) {
        const user_id = participant.user_id;
        let user_state:
          | "miglior_offerta"
          | "rilancio_possibile"
          | "asta_abbandonata" = "asta_abbandonata"; // Default
        let response_deadline: number | null = null;
        let _activated_at: number | null = null;
        let time_remaining: number | null = null;
        let is_highest_bidder: boolean = false;

        // Check if this manager is the highest bidder for this auction
        if (auction.current_highest_bidder_id === user_id) {
          is_highest_bidder = true;
          user_state = "miglior_offerta";
        }

        // Find response timer for this specific user and auction
        const timer = allResponseTimers.find(
          (t) => t.auction_id === auction.auction_id && t.user_id === user_id
        );

        if (timer) {
          response_deadline = timer.response_deadline;
          _activated_at = timer.activated_at;
          if (response_deadline !== null) {
            time_remaining = Math.max(0, response_deadline - now);
          }
          // If there's a pending timer and the user is not the highest bidder, it's 'rilancio_possibile'
          if (timer.status === "pending" && !is_highest_bidder) {
            user_state = "rilancio_possibile";
          }
        }

        states.push({
          auction_id: auction.auction_id,
          player_id: auction.player_id,
          user_id: user_id, // Crucial for the frontend
          player_name: auction.player_name,
          current_bid: auction.current_highest_bid_amount,
          user_state: user_state,
          response_deadline: response_deadline,
          time_remaining: time_remaining,
          is_highest_bidder: is_highest_bidder,
        });
      }
    }

    return NextResponse.json({
      states: states,
      count: states.length,
    });
  } catch (error) {
    console.error("[ALL_AUCTION_STATES] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
