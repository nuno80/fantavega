import { processExpiredComplianceTimers } from "@/lib/db/services/penalty.service";
import { createAdminTimerTaskHandlers } from "@/lib/http/admin-task";

const handlers = createAdminTimerTaskHandlers(
  "PROCESS_COMPLIANCE_TIMERS",
  processExpiredComplianceTimers,
);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const dynamic = "force-dynamic";
