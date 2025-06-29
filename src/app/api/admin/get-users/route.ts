// src/app/api/admin/get-users/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUsersWithLeagueDetails } from "@/lib/db/services/user.service";

export async function GET() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized: Login required." }, { status: 401 });
  }

  const isAdmin = sessionClaims?.metadata?.role === "admin";

  if (!isAdmin) {
    console.warn(
      `API access denied for get-users for user ${userId}. Role (from claims): ${sessionClaims?.metadata?.role}`
    );
    return NextResponse.json({ error: "Access denied: Insufficient privileges." }, { status: 403 });
  }

  try {
    console.log(`Admin ${userId} confirmed via sessionClaims. Fetching user list with league details...`);
    
    const users = await getUsersWithLeagueDetails();
    
    console.log(`Successfully fetched ${users.length} users with details.`);
    return NextResponse.json({ users });
  } catch (error: unknown) {
    console.error("API Error loading users:", error);
    let errorMessage = "Internal server error while loading users.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // Includi più dettagli dell'errore nel log server-side per il debug
    if (typeof error === "object" && error !== null && "message" in error) {
      console.error(
        "Error details:",
        (error as { message: string }).message,
        error
      );
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
