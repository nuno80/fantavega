// src/app/api/admin/get-users/route.ts
import { NextResponse } from "next/server";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { getUsersWithLeagueDetails } from "@/lib/db/services/user.service";

type AppRole = "admin" | "manager";

export async function GET() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized: Login required." },
      { status: 401 }
    );
  }

  // Verifica ruolo admin con fallback multipli (allineato con middleware)
  let isAdmin = false;
  let roleSource = "none";

  // Tentativo 1: sessionClaims.metadata.role
  if (sessionClaims?.metadata?.role === "admin") {
    isAdmin = true;
    roleSource = "sessionClaims.metadata.role";
  }
  // Tentativo 2: sessionClaims.publicMetadata.role (camelCase)
  else if (sessionClaims?.publicMetadata?.role === "admin") {
    isAdmin = true;
    roleSource = "sessionClaims.publicMetadata.role";
  }
  // Tentativo 3: sessionClaims['public_metadata'].role (snake_case)
  else {
    const snakeCasePublicMeta = sessionClaims?.["public_metadata"] as
      | { role?: AppRole }
      | undefined;
    if (snakeCasePublicMeta?.role === "admin") {
      isAdmin = true;
      roleSource = "sessionClaims['public_metadata'].role";
    }
  }

  // Tentativo 4: Fallback a clerkClient API
  if (!isAdmin) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const clerkRole = user.publicMetadata?.role as AppRole | undefined;
      if (clerkRole === "admin") {
        isAdmin = true;
        roleSource = "clerkClient API fallback";
      }
    } catch (error) {
      console.error("[get-users] Error fetching user from Clerk API:", error);
    }
  }

  console.log(`[get-users] Role verification for ${userId}: isAdmin=${isAdmin}, source=${roleSource}`);

  if (!isAdmin) {
    console.warn(
      `API access denied for get-users for user ${userId}. Role source: ${roleSource}`
    );
    return NextResponse.json(
      { error: "Access denied: Insufficient privileges." },
      { status: 403 }
    );
  }

  try {
    console.log(
      `Admin ${userId} confirmed via sessionClaims. Fetching user list with league details...`
    );

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
