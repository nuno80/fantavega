// src/app/api/admin/tasks/schedule-compliance-timers/route.ts
// Task schedulato per processare automaticamente i timer di compliance scaduti
import { NextResponse } from "next/server";

import { processExpiredComplianceTimers } from "@/lib/db/services/penalty.service";

export async function GET() {
  try {
    console.log("[SCHEDULE_COMPLIANCE_TIMERS] Starting scheduled processing...");

    const result = await processExpiredComplianceTimers();

    console.log(
      `[SCHEDULE_COMPLIANCE_TIMERS] Completed. Processed: ${result.processedCount}, Errors: ${result.errors.length}`
    );

    if (result.errors.length > 0) {
      console.error("[SCHEDULE_COMPLIANCE_TIMERS] Errors:", result.errors);
    }

    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      errorCount: result.errors.length,
      timestamp: new Date().toISOString(),
      message: `Processed ${result.processedCount} expired compliance timers`,
    });
  } catch (error) {
    console.error("[SCHEDULE_COMPLIANCE_TIMERS] Critical error:", error);
    return NextResponse.json(
      {
        error: "Failed to process expired compliance timers",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Supporta anche POST per compatibilità con diversi sistemi di scheduling
export async function POST() {
  return GET();
}

export const dynamic = "force-dynamic";