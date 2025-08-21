// src/app/api/admin/tasks/process-response-timers/route.ts
// Task automatico per processare i timer di risposta scaduti
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { processExpiredResponseTimers } from "@/lib/db/services/response-timer.service";

export async function POST() {
  try {
    // Verifica autenticazione admin (opzionale per task automatici)
    const user = await currentUser();
    if (user) {
      const userRole = user.publicMetadata?.role as string;
      if (userRole !== "admin") {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 }
        );
      }
    }

    console.log(
      "[PROCESS_RESPONSE_TIMERS] Starting processing of expired response timers..."
    );

    const result = await processExpiredResponseTimers();

    console.log(
      `[PROCESS_RESPONSE_TIMERS] Completed. Processed: ${result.processedCount}, Errors: ${result.errors.length}`
    );

    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      errors: result.errors,
      message: `Processed ${result.processedCount} expired response timers`,
    });
  } catch (error) {
    console.error("[PROCESS_RESPONSE_TIMERS] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process expired response timers",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
