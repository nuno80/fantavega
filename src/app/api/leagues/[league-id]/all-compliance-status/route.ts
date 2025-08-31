import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// Define the context interface according to the project's convention
interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Await the params as per the project's convention
    const resolvedParams = await context.params;
    const leagueIdStr = resolvedParams["league-id"];
    const leagueId = parseInt(leagueIdStr, 10);

    if (isNaN(leagueId)) {
      return new NextResponse("Invalid League ID", { status: 400 });
    }

    // Verify the user is a participant of the league to authorize the request
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

    // Get current league status and active roles to determine phase identifier
    const leagueInfo = db
      .prepare(
        "SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?"
      )
      .get(leagueId) as
      | { status: string; active_auction_roles: string | null }
      | undefined;

    if (!leagueInfo) {
      return new NextResponse("League not found", { status: 404 });
    }

    // Calculate current phase identifier
    const getCurrentPhaseIdentifier = (
      leagueStatus: string,
      activeRolesString: string | null
    ): string => {
      if (
        !activeRolesString ||
        activeRolesString.trim() === "" ||
        activeRolesString.toUpperCase() === "ALL"
      ) {
        return `${leagueStatus}_ALL_ROLES`;
      }
      const sortedRoles = activeRolesString
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .sort()
        .join(",");
      return `${leagueStatus}_${sortedRoles}`;
    };

    const currentPhaseIdentifier = getCurrentPhaseIdentifier(
      leagueInfo.status,
      leagueInfo.active_auction_roles
    );

    // Get compliance data for current phase only
    const complianceData = db
      .prepare(
        "SELECT user_id, compliance_timer_start_at FROM user_league_compliance_status WHERE league_id = ? AND phase_identifier = ?"
      )
      .all(leagueId, currentPhaseIdentifier);

    return NextResponse.json(complianceData);
  } catch (error) {
    console.error("[GET_ALL_COMPLIANCE_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
