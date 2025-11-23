// src/app/api/leagues/[league-id]/check-compliance/route.ts v.2.0 (Async Turso Migration)
// API Route per triggerare il controllo di conformità, ora accetta un userId nel body
// per permettere il controllo su utenti specifici da parte di altri partecipanti.
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { processUserComplianceAndPenalties } from "@/lib/db/services/penalty.service";

interface RouteContext {
  params: Promise<{ "league-id": string }>;
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  console.log("[API CHECK_COMPLIANCE POST] Request received.");

  try {
    const user = await currentUser();
    if (!user || !user.id) {
      console.warn(
        "[API CHECK_COMPLIANCE POST] Unauthorized: No user session found."
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authenticatedUserId = user.id;

    const routeParams = await context.params;
    const leagueIdStr = routeParams["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      console.warn(
        `[API CHECK_COMPLIANCE POST] Invalid league ID: ${leagueIdStr}`
      );
      return NextResponse.json({ error: "Invalid league ID" }, { status: 400 });
    }

    // L'utente autenticato deve essere un partecipante per eseguire qualsiasi check
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueIdNum, authenticatedUserId],
    });
    const isParticipant = participantCheckResult.rows.length > 0;

    if (!isParticipant) {
      console.warn(
        `[API CHECK_COMPLIANCE POST] Forbidden: User ${authenticatedUserId} is not a participant of league ${leagueIdNum}.`
      );
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prova a leggere il body per un targetUserId, altrimenti usa l'utente autenticato
    let targetUserId = authenticatedUserId;
    try {
      const body = await request.json();
      if (body.userId) {
        targetUserId = body.userId;
        console.log(
          `[API CHECK_COMPLIANCE POST] Authenticated user ${authenticatedUserId} is checking compliance for target user ${targetUserId}.`
        );
      }
    } catch (_e) {
      // Body non presente o non JSON, va bene, usiamo l'utente autenticato
      console.log(
        `[API CHECK_COMPLIANCE POST] No target user in body, checking for authenticated user ${authenticatedUserId}.`
      );
    }

    const result = await processUserComplianceAndPenalties(
      leagueIdNum,
      targetUserId
    );

    console.log(
      `[API CHECK_COMPLIANCE POST] Compliance check for user ${targetUserId} in league ${leagueIdNum} completed.`
    );
    return NextResponse.json(
      {
        message: result.message,
        appliedPenaltyAmount: result.appliedPenaltyAmount,
        totalPenaltyAmount: result.totalPenaltyAmount,
        isNowCompliant: result.isNowCompliant,
        gracePeriodEndTime: result.gracePeriodEndTime,
        timeRemainingSeconds: result.timeRemainingSeconds,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[API CHECK_COMPLIANCE POST] Error: ${errorMessage}`, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
