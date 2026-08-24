import { NextResponse } from "next/server";

import {
  adminAuthorizationErrorResponse,
  authorizeAdminRequest,
} from "@/lib/auth/admin-route";
import { getDashboardStats } from "@/lib/db/services/admin.service";

export async function GET() {
  const authorization = await authorizeAdminRequest();
  if (!authorization.authorized) {
    return adminAuthorizationErrorResponse(authorization);
  }

  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API_ADMIN_DASHBOARD_STATS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
