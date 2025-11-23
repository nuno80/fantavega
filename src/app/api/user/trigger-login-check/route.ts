// src/app/api/user/trigger-login-check/route.ts v.2.0 (Async Turso Migration)
import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { checkAndRecordCompliance } from "@/lib/db/services/penalty.service";

export async function POST(_req: Request) {
  try {
    const { userId, sessionId } = await auth();

    if (!userId || !sessionId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 1. Check if this session has already been processed
    const checkResult = await db.execute({
      sql: "SELECT session_id FROM processed_login_sessions WHERE session_id = ?",
      args: [sessionId],
    });
    const existingSession = checkResult.rows[0];

    if (existingSession) {
      return NextResponse.json({
        message: "Login compliance check already performed for this session.",
      });
    }

    // 2. If not processed, run the compliance check logic
    console.log(
      `Performing first-time login compliance check for session: ${sessionId}`
    );

    const leaguesResult = await db.execute({
      sql: "SELECT league_id FROM league_participants WHERE user_id = ?",
      args: [userId],
    });
    const leagues = leaguesResult.rows as unknown as { league_id: number }[];

    if (leagues.length > 0) {
      for (const league of leagues) {
        await checkAndRecordCompliance(userId, league.league_id);
      }
    }

    // 3. Record this session as processed to prevent re-running
    await db.execute({
      sql: "INSERT INTO processed_login_sessions (session_id, user_id) VALUES (?, ?)",
      args: [sessionId, userId],
    });

    return NextResponse.json({
      message: "Login compliance check performed successfully.",
    });
  } catch (error) {
    console.error("[TRIGGER_LOGIN_CHECK]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
