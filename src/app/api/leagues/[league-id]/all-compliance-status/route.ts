import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { hasLeagueAccess } from "@/lib/auth/league-guard";
import { getAllComplianceStatus } from "@/lib/db/services/penalty.service";

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

    // Policy SEC-005: visibile a partecipanti e admin
    if (!(await hasLeagueAccess(userId, leagueId))) {
      return new NextResponse(
        "Forbidden: You are not a member of this league",
        {
          status: 403,
        }
      );
    }

    const complianceData = await getAllComplianceStatus(leagueId);

    return NextResponse.json(complianceData);
  } catch (error) {
    console.error("[GET_ALL_COMPLIANCE_STATUS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
