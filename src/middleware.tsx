// src/middleware.ts
import { NextResponse } from "next/server";

import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

type AppRole = "admin" | "manager";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about",
  "/pricing",
  "/devi-autenticarti",
  "/no-access",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
  "/dashboard(.*)",
  "/api/admin/(.*)",
]);
const isAuthenticatedRoute = createRouteMatcher([
  "/features(.*)",
  "/api/user/(.*)",
  "/api/leagues/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // Per debug, puoi decommentare le seguenti righe per vedere i log
  //console.log("\n--- CLERK MIDDLEWARE V5.2 ---");
  //console.log(`[REQ] ${req.method} ${req.url}`);
  //console.log(`[AUTH] User ID: ${userId}`);

  if (isPublicRoute(req)) {
    console.log(`[DECISION] Public route. Allowing for ${req.url}.`);
    return NextResponse.next();
  }

  if (!userId) {
    console.log("[DECISION] User not authenticated.");
    if (req.url.startsWith("/api")) {
      console.log("[ACTION] Returning 401 for API request.");
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search
    );
    console.log(`[ACTION] Redirecting to sign-in: ${signInUrl.toString()}`);
    return NextResponse.redirect(signInUrl);
  }

  console.log(`[AUTH] User ${userId} is authenticated.`);
  // DEBUG: Log completo dei sessionClaims per diagnostica
  console.log(`[AUTH] SessionClaims:`, JSON.stringify(sessionClaims, null, 2));

  if (isAdminRoute(req)) {
    console.log(
      `[ROUTE] Admin route matched for ${req.url}. Checking admin role for user ${userId}.`
    );

    let userIsAdmin = false;
    let roleSource = "none";

    // Tentativo 1: Cerca nei sessionClaims (se il Session Token è configurato correttamente)
    if (sessionClaims) {
      if (sessionClaims.metadata?.role === "admin") {
        userIsAdmin = true;
        roleSource = "sessionClaims.metadata.role";
      } else if (sessionClaims.publicMetadata?.role === "admin") {
        userIsAdmin = true;
        roleSource = "sessionClaims.publicMetadata.role (camelCase)";
      } else {
        const snakeCasePublicMeta = sessionClaims["public_metadata"] as
          | { role?: AppRole }
          | undefined;
        if (snakeCasePublicMeta?.role === "admin") {
          userIsAdmin = true;
          roleSource = "sessionClaims['public_metadata'].role (snake_case)";
        }
      }
    }

    // Tentativo 2: Fallback a clerkClient per ottenere i publicMetadata direttamente da Clerk API
    // Questo è necessario quando il Session Token di Clerk non è configurato per includere i metadata
    if (!userIsAdmin && userId) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const clerkRole = user.publicMetadata?.role as AppRole | undefined;
        if (clerkRole === "admin") {
          userIsAdmin = true;
          roleSource = "clerkClient.users.getUser (API fallback)";
        }
        console.log(`[AUTH] Clerk API publicMetadata:`, JSON.stringify(user.publicMetadata));
      } catch (error) {
        console.error("[AUTH] Error fetching user from Clerk API:", error);
      }
    }

    console.log(
      `[AUTH] Role source for admin check: ${roleSource}. Role found: ${userIsAdmin ? "admin" : "not admin or not found"}`
    );
    console.log(`[AUTH] Result of userIsAdmin check: ${userIsAdmin}`);

    if (userIsAdmin) {
      console.log("[DECISION] Admin access GRANTED.");
      return NextResponse.next();
    } else {
      console.log("[DECISION] Admin access DENIED. User is not admin.");
      if (req.url.startsWith("/api")) {
        console.log("[ACTION] Returning 403 for API admin request.");
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Admin role required" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      const noAccessUrl = new URL("/no-access", req.url);
      console.log("[ACTION] Redirecting to /no-access.");
      return NextResponse.redirect(noAccessUrl);
    }
  }

  if (isAuthenticatedRoute(req)) {
    console.log(
      `[ROUTE] Authenticated (non-admin) route matched for ${req.url}. Access GRANTED for user ${userId}.`
    );
    return NextResponse.next();
  }

  console.log(
    `[ROUTE] Unspecified protected route for ${req.url}. Allowing access for authenticated user ${userId}.`
  );
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
