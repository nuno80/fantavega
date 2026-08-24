import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/lib/auth/admin-route";
import { processExpiredAuctionsAndAssignPlayers } from "@/lib/db/services/bid.service";

export async function POST() {
  const authorization = await authorizeAdminRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  try {
    const result = await processExpiredAuctionsAndAssignPlayers();
    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      errorCount: result.errors.length,
    });
  } catch (error) {
    console.error("[PROCESS_AUCTIONS] Processing failed", error);
    return NextResponse.json({ error: "Task processing failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
