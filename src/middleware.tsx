import { NextResponse } from "next/server";
import { clerkClient, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

type AppRole = "admin" | "manager";

const isPublicRoute = createRouteMatcher([
  "/", "/about", "/pricing", "/devi-autenticarti", "/no-access",
  "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks(.*)",
]);
const isAdminRoute = createRouteMatcher([
  "/admin(.*)", "/dashboard(.*)", "/api/admin/(.*)", "/api/debug/(.*)",
]);
const isAuthenticatedRoute = createRouteMatcher([
  "/features(.*)", "/api/user/(.*)", "/api/leagues/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  if (isPublicRoute(req)) return NextResponse.next();
  if (!userId) {
    if (req.nextUrl.pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  if (isAdminRoute(req)) {
    let isAdmin = sessionClaims?.metadata?.role === "admin" || sessionClaims?.publicMetadata?.role === "admin";
    if (!isAdmin) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        isAdmin = (user.publicMetadata?.role as AppRole | undefined) === "admin";
      } catch {
        isAdmin = false;
      }
    }
    if (isAdmin) return NextResponse.next();
    return req.nextUrl.pathname.startsWith("/api")
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : NextResponse.redirect(new URL("/no-access", req.url));
  }

  if (isAuthenticatedRoute(req)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
