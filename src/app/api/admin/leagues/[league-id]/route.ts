// src/app/api/admin/leagues/[league-id]/route.ts
import { NextResponse } from "next/server";

// Assicurati che il percorso sia corretto
import { currentUser } from "@clerk/nextjs/server";

import {
  type UpdateAuctionLeagueData,
  getAuctionLeagueByIdForAdmin,
  updateAuctionLeague,
} from "@/lib/db/services/auction-league.service";

// Definisci il tipo corretto per i parametri
interface RouteParams {
  params: Promise<{ "league-id": string }>;
}

export async function GET(_request: Request, context: RouteParams) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: User is not an admin" },
        { status: 403 }
      );
    }

    // Await dei parametri
    const params = await context.params;
    const leagueIdStr = params["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    console.log(
      `[API] GET /api/admin/leagues/${leagueIdNum} request by admin: ${user.id}`
    );
    const league = await getAuctionLeagueByIdForAdmin(leagueIdNum, user.id);

    if (!league) {
      return NextResponse.json(
        { error: "League not found or not owned by user" },
        { status: 404 }
      );
    }

    return NextResponse.json(league, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API] GET /api/admin/leagues/[league-id] error: ${errorMessage}`
    );
    return NextResponse.json(
      { error: "Failed to retrieve league" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteParams) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Forbidden: User is not an admin" },
        { status: 403 }
      );
    }

    // Await dei parametri
    const params = await context.params;
    const leagueIdStr = params["league-id"];
    const leagueIdNum = parseInt(leagueIdStr, 10);

    if (isNaN(leagueIdNum)) {
      return NextResponse.json(
        { error: "Invalid league ID format" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as UpdateAuctionLeagueData;

    if (
      body.name !== undefined &&
      (typeof body.name !== "string" || body.name.trim() === "")
    ) {
      return NextResponse.json(
        { error: "Invalid league name provided for update" },
        { status: 400 }
      );
    }
    // ...altre validazioni per i campi in body...

    console.log(
      `[API] PUT /api/admin/leagues/${leagueIdNum} request by admin: ${user.id} with body:`,
      body
    );
    const updatedLeague = await updateAuctionLeague(leagueIdNum, body, user.id);

    return NextResponse.json(updatedLeague, { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[API] PUT /api/admin/leagues/[league-id] error: ${errorMessage}`
    );
    if (error instanceof Error) {
      if (
        error.message.includes("not found or user is not authorized") ||
        error.message.includes(
          "can only be changed when league status is 'setup'"
        ) ||
        error.message.includes("cannot be empty") ||
        error.message.includes("already exists")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json(
      { error: "Failed to update league" },
      { status: 500 }
    );
  }
}
