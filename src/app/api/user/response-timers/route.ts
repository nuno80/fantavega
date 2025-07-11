// src/app/api/user/response-timers/route.ts
// API per ottenere i timer di risposta attivi dell'utente

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Autenticazione
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[USER_RESPONSE_TIMERS] Fetching timers for user: ${user.id}`);

    // Ottieni i timer attivi con query corretta
    const activeTimers = db.prepare(`
      SELECT urt.id, urt.auction_id, urt.user_id, urt.response_deadline,
             a.player_id, a.current_highest_bid_amount, p.name as player_name
      FROM user_auction_response_timers urt
      JOIN auctions a ON urt.auction_id = a.id
      JOIN players p ON a.player_id = p.id
      WHERE urt.user_id = ? AND urt.status = 'pending' AND a.status = 'active'
      ORDER BY urt.response_deadline ASC
    `).all(user.id) as Array<{
      id: number;
      auction_id: number;
      user_id: string;
      response_deadline: number;
      player_id: number;
      current_highest_bid_amount: number;
      player_name: string;
    }>;

    console.log(`[USER_RESPONSE_TIMERS] Found ${activeTimers.length} active timers:`, activeTimers);

    // Trasforma i dati per includere informazioni aggiuntive
    const timersWithDetails = activeTimers.map(timer => ({
      auction_id: timer.auction_id,
      player_id: timer.player_id, // CORRETTO: questo è il player_id dall'asta
      player_name: timer.player_name,
      response_deadline: timer.response_deadline,
      current_bid: timer.current_highest_bid_amount,
      time_remaining: Math.max(0, timer.response_deadline - Math.floor(Date.now() / 1000))
    }));

    console.log(`[USER_RESPONSE_TIMERS] Returning timers:`, timersWithDetails);

    return NextResponse.json({
      timers: timersWithDetails,
      count: timersWithDetails.length
    });

  } catch (error) {
    console.error('[USER_RESPONSE_TIMERS] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";