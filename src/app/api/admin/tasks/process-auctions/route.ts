import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/lib/auth/admin-route";
import { processExpiredAuctionsAndAssignPlayers } from "@/lib/db/services/bid.service";
import { createAdminAuditRecorder } from "@/lib/security/admin-audit";

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST() {
  const authorization = await authorizeAdminRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const audit = createAdminAuditRecorder({
    actorUserId: authorization.userId,
    action: "admin-task.run",
    resource: "process-auctions",
  });

  try {
    const result = await processExpiredAuctionsAndAssignPlayers();
    const response = NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      errorCount: result.errors.length,
    });
    audit("success");
    return response;
  } catch (error) {
    audit("failure");
    console.error("[PROCESS_AUCTIONS] Processing failed", error);
    return NextResponse.json({ error: "Task processing failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
