import { NextResponse } from "next/server";

import { authorizeAdminRequest } from "@/lib/auth/admin-route";

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

    try {
      const result = await processor();
      return NextResponse.json({
        success: true,
        processedCount: result.processedCount,
        errorCount: result.errors.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[${taskName}] Processing failed`, error);
      return NextResponse.json({ error: "Task processing failed" }, { status: 500 });
    }
  }

  return { GET, POST };
}
