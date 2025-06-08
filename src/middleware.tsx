// src/middleware.ts
import { NextResponse } from "next/server";

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Definisci le rotte pubbliche
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

// Definisci le rotte admin
const isAdminApiRoute = createRouteMatcher(["/api/admin/(.*)"]);
const isAdminPageRoute = createRouteMatcher(["/admin(.*)", "/dashboard(.*)"]);

// Definisci le rotte autenticate generiche
const isAuthenticatedRoute = createRouteMatcher(["/features(.*)"]);

export default clerkMiddleware(async (clerkAuth, req) => {
  const { userId, sessionClaims } = await clerkAuth();

  console.log("\n--- CLERK MIDDLEWARE (V4.1 CLEANUP TS EXPECT) ---");
  console.log("Request URL:", req.url);
  console.log("User ID from auth():", userId);
  console.log(
    "Raw SessionClaims from auth():",
    JSON.stringify(sessionClaims, null, 2)
  );

  if (isPublicRoute(req)) {
    console.log(`Middleware: Public route ${req.url}, allowing.`);
    return NextResponse.next();
  }

  if (!userId) {
    console.log(`Middleware: User not authenticated for ${req.url}.`);
    if (req.url.startsWith("/api")) {
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
    console.log(
      `Middleware: Redirecting unauthenticated user to ${signInUrl.toString()}`
    );
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminApiRoute(req) || isAdminPageRoute(req)) {
    console.log(
      `Middleware: Admin route ${req.url} matched. Checking role for user ${userId}.`
    );

    let roleFromSessionMetadata: string | undefined = undefined;
    let roleFromTokenPublicMetadataCamel: string | undefined = undefined;
    let roleFromTokenPublicMetadataSnake: string | undefined = undefined;

    if (sessionClaims) {
      // Tentiamo l'accesso diretto. Se globals.d.ts è corretto, questo potrebbe non dare errore.
      if (
        sessionClaims.metadata &&
        typeof sessionClaims.metadata === "object" &&
        "role" in sessionClaims.metadata
      ) {
        roleFromSessionMetadata = (sessionClaims.metadata as { role?: string })
          .role; // Cast per sicurezza
      }

      if (
        sessionClaims.publicMetadata &&
        typeof sessionClaims.publicMetadata === "object" &&
        "role" in sessionClaims.publicMetadata
      ) {
        roleFromTokenPublicMetadataCamel = (
          sessionClaims.publicMetadata as { role?: string }
        ).role; // Cast per sicurezza
      }

      const snakeCasePublicMeta = sessionClaims["public_metadata"]; // Accesso con stringa
      if (
        snakeCasePublicMeta &&
        typeof snakeCasePublicMeta === "object" &&
        "role" in snakeCasePublicMeta
      ) {
        roleFromTokenPublicMetadataSnake = (
          snakeCasePublicMeta as { role?: string }
        ).role; // Cast per sicurezza
      }
    }

    console.log(
      `Value of sessionClaims.metadata.role: [${roleFromSessionMetadata}]`
    );
    console.log(
      `Value of sessionClaims.publicMetadata.role (camelCase): [${roleFromTokenPublicMetadataCamel}]`
    );
    console.log(
      `Value of sessionClaims['public_metadata']?.role (snake_case): [${roleFromTokenPublicMetadataSnake}]`
    );

    const userIsAdmin =
      roleFromSessionMetadata === "admin" ||
      roleFromTokenPublicMetadataCamel === "admin" ||
      roleFromTokenPublicMetadataSnake === "admin";

    console.log(`Result of userIsAdmin check: ${userIsAdmin}`);

    if (userIsAdmin) {
      console.log(
        `Middleware: Admin access GRANTED for user ${userId} to ${req.url}.`
      );
      return NextResponse.next();
    } else {
      console.log(
        `Middleware: Admin access DENIED for user ${userId} to ${req.url}. Role is not admin.`
      );
      if (req.url.startsWith("/api")) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden: Admin role required" }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      const noAccessUrl = new URL("/no-access", req.url);
      return NextResponse.redirect(noAccessUrl);
    }
  }

  if (isAuthenticatedRoute(req)) {
    console.log(
      `Middleware: Authenticated (non-admin) access GRANTED for user ${userId} to ${req.url}`
    );
    return NextResponse.next();
  }

  console.log(
    `Middleware: Authenticated user ${userId} accessing unspecified/unmatched protected route ${req.url}. Allowing by default.`
  );
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
