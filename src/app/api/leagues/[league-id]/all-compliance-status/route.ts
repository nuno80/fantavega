import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { processUserComplianceAndPenalties } from "@/lib/db/services/penalty.service";

// Define the context interface according to the project's convention
interface RouteContext {
  params: Promise<{ "league-id": string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const resolvedParams = await context.params;
    const leagueId = parseInt(resolvedParams["league-id"], 10);

    if (isNaN(leagueId)) {
      return new NextResponse("Invalid League ID", { status: 400 });
    }

    const participantCheck = db
      .prepare(
        "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?"
      )
      .get(leagueId, userId);

    if (!participantCheck) {
      return new NextResponse(
        "Forbidden: You are not a member of this league",
        {
          status: 403,
        }
      );
    }

    // Get all participants to trigger their compliance check
    const participants = db
      .prepare("SELECT user_id FROM league_participants WHERE league_id = ?")
      .all(leagueId) as { user_id: string }[];

    // Trigger compliance check for all participants
    for (const participant of participants) {
      // We don't need the result, just the side-effect of updating the DB
      await processUserComplianceAndPenalties(leagueId, participant.user_id);
    }

    // Now, fetch the fresh data
    const complianceData = db
      .prepare(
        "SELECT user_id, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ?"
      )
      .all(leagueId);

    return NextResponse.json({ complianceStatus: complianceData });
  } catch (error) {
    console.error("[GET_ALL_COMPLIANCE_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
