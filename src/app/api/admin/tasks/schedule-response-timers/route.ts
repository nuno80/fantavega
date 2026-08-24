import { processExpiredResponseTimers } from "@/lib/db/services/response-timer.service";
import { createAdminTimerTaskHandlers } from "@/lib/http/admin-task";

const handlers = createAdminTimerTaskHandlers(
  "SCHEDULE_RESPONSE_TIMERS",
  processExpiredResponseTimers,
);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const dynamic = "force-dynamic";
