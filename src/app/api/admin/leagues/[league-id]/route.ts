// src/app/api/admin/leagues/[league-id]/participants/route.ts
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{
    "league-id": string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const routeParams = await context.params;
    const leagueId = routeParams["league-id"];

    // const body = await request.json(); // Temporaneamente commentato
    return NextResponse.json(
      { message: `SUCCESS: POST request received for league ${leagueId}` },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SIMPLIFIED API POST Participants] Error: ${errorMessage}`);
    return NextResponse.json(
      {
        error: "Error in simplified POST handler for participants",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const routeParams = await context.params;
    const leagueId = routeParams["league-id"];
    console.log(
      `!!!!!!!!!! SIMPLIFIED GET HANDLER REACHED for /api/admin/leagues/${leagueId}/participants !!!!!!!!!!`
    );
    return NextResponse.json(
      {
        message: `SUCCESS: GET request received for league ${leagueId}, implement actual logic for participants.`,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[SIMPLIFIED API GET Participants] Error: ${errorMessage}`);
    return NextResponse.json(
      {
        error: "Error in simplified GET handler for participants",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
export const dynamic = "force-dynamic";
