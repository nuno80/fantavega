// src/app/api/admin/tasks/process-compliance-timers/route.ts
// Task automatico per processare i timer di compliance scaduti
import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import { processExpiredComplianceTimers } from "@/lib/db/services/penalty.service";

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
      "[PROCESS_COMPLIANCE_TIMERS] Starting processing of expired compliance timers..."
    );

    const result = await processExpiredComplianceTimers();

    console.log(
      `[PROCESS_COMPLIANCE_TIMERS] Completed. Processed: ${result.processedCount}, Errors: ${result.errors.length}`
    );

    return NextResponse.json({
      success: true,
      processedCount: result.processedCount,
      errors: result.errors,
      message: `Processed ${result.processedCount} expired compliance timers`,
    });
  } catch (error) {
    console.error("[PROCESS_COMPLIANCE_TIMERS] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process expired compliance timers",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";