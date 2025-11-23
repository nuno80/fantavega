import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// Helper function to create phase identifier (same as in penalty.service.ts)
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
    const participantCheckResult = await db.execute({
      sql: "SELECT 1 FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, userId],
    });
    const participantCheck = participantCheckResult.rows.length > 0;

    if (!participantCheck) {
      return new NextResponse(
        "Forbidden: You are not a member of this league",
        {
          status: 403,
        }
      );
    }

    // Get the current phase identifier for the league using the same logic as penalty.service.ts
    const leagueInfoResult = await db.execute({
      sql: "SELECT status, active_auction_roles FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const leagueInfo = leagueInfoResult.rows[0] as unknown as { status: string; active_auction_roles: string | null } | undefined;

    if (!leagueInfo) {
      return new NextResponse("League not found", { status: 404 });
    }

    // Construct the phase identifier using the same logic as in penalty.service.ts
    const phaseIdentifier = getCurrentPhaseIdentifier(
      leagueInfo.status,
      leagueInfo.active_auction_roles
    );

    console.log(`[GET_ALL_COMPLIANCE_STATUS] Using phase_identifier: ${phaseIdentifier} for league ${leagueId}`);

    // Define type for compliance data
    interface ComplianceRecord {
      user_id: number;
      compliance_timer_start_at: string | null;
    }

    // Get compliance data for all users in the league with the specific phase identifier
    // Use a subquery to get only the most recent record for each user based on updated_at timestamp
    const complianceDataResult = await db.execute({
      sql: `SELECT t1.user_id, t1.compliance_timer_start_at
         FROM user_league_compliance_status t1
         INNER JOIN (
           SELECT user_id, MAX(updated_at) as max_updated_at
           FROM user_league_compliance_status
           WHERE league_id = ? AND phase_identifier = ?
           GROUP BY user_id
         ) t2 ON t1.user_id = t2.user_id AND t1.updated_at = t2.max_updated_at
         WHERE t1.league_id = ? AND t1.phase_identifier = ?`,
      args: [leagueId, phaseIdentifier, leagueId, phaseIdentifier],
    });
    const complianceData = complianceDataResult.rows as unknown as ComplianceRecord[];

    console.log(`[GET_ALL_COMPLIANCE_STATUS] Found ${complianceData.length} compliance records for league ${leagueId} and phase ${phaseIdentifier}`);

    // Log the compliance data for debugging
    complianceData.forEach((record: ComplianceRecord) => {
      console.log(`[GET_ALL_COMPLIANCE_STATUS] User ${record.user_id}: compliance_timer_start_at = ${record.compliance_timer_start_at}`);
    });

    return NextResponse.json(complianceData);
  } catch (error) {
    console.error("[GET_ALL_COMPLIANCE_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
