// src/app/api/admin/tasks/schedule-response-timers/route.ts
// Task schedulato per processare automaticamente i timer di risposta scaduti
import { NextResponse } from "next/server";

import { processExpiredResponseTimers } from "@/lib/db/services/response-timer.service";

export async function GET() {
  try {
    console.log("[SCHEDULE_RESPONSE_TIMERS] Starting scheduled processing...");

    const result = await processExpiredResponseTimers();

    console.log(
      `[SCHEDULE_RESPONSE_TIMERS] Completed. Processed: ${result.processedCount}, Errors: ${result.errors.length}`
    );

    if (result.errors.length > 0) {
      console.error("[SCHEDULE_RESPONSE_TIMERS] Errors:", result.errors);
    }

    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      errorCount: result.errors.length,
      timestamp: new Date().toISOString(),
      message: `Processed ${result.processedCount} expired response timers`,
    });
  } catch (error) {
    console.error("[SCHEDULE_RESPONSE_TIMERS] Critical error:", error);
    return NextResponse.json(
      {
        error: "Failed to process expired response timers",
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
