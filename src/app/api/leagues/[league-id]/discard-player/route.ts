import { NextRequest, NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { discardPlayerFromRoster } from "@/lib/db/services/player-discard.service";

const discardPlayerSchema = z.object({
  playerId: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "league-id": string }> }
) {
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { "league-id": leagueIdStr } = await params;
    const leagueId = parseInt(leagueIdStr);
    if (isNaN(leagueId)) {
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    const body = await request.json();
    const validation = discardPlayerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { playerId } = validation.data;

    // Perform player discard
    const result = await discardPlayerFromRoster(leagueId, playerId, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.statusCode || 400 }
      );
    }

    console.log("[PLAYER_DISCARD] Successfully discarded player:", {
      leagueId,
      playerId,
      userId: user.id,
      refundAmount: result.refundAmount,
    });

    // TODO: Add real-time notification via Socket.IO once socket emitter is available
    // if (io) {
    //   io.to(`league-${leagueId}`).emit("player-discarded", {
    //     playerId,
    //     playerName: result.playerName,
    //     userId: user.id,
    //     refundAmount: result.refundAmount,
    //     timestamp: new Date().toISOString(),
    //   });
    // }

    return NextResponse.json({
      success: true,
      message: "Player discarded successfully",
      refundAmount: result.refundAmount,
      playerName: result.playerName,
    });
  } catch (error) {
    console.error("[PLAYER_DISCARD] API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
