import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/lib/auth/admin-route";
import { createAdminAuditRecorder } from "@/lib/security/admin-audit";

interface AdminTimerTaskResult {
  processedCount: number;
  errors: readonly unknown[];
}

type AdminTimerTaskProcessor = () => Promise<AdminTimerTaskResult>;

export function createAdminTimerTaskHandlers(
  taskName: string,
  processor: AdminTimerTaskProcessor,
) {
  function GET() {
    return NextResponse.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  async function POST() {
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
      resource: taskName,
    });

    try {
      const result = await processor();
      const response = NextResponse.json({
        success: true,
        processedCount: result.processedCount,
        errorCount: result.errors.length,
        timestamp: new Date().toISOString(),
      });
      audit("success");
      return response;
    } catch (error) {
      audit("failure");
      console.error(`[${taskName}] Processing failed`, error);
      return NextResponse.json({ error: "Task processing failed" }, { status: 500 });
    }
  }

  return { GET, POST };
}
