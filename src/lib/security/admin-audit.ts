import { logger } from "@/lib/logger";

export type AdminAuditAction = "debug.read" | "admin-task.run";
export type AdminAuditOutcome = "success" | "failure";

interface AdminAuditEvent {
  actorUserId: string;
  action: AdminAuditAction;
  resource: string;
  outcome: AdminAuditOutcome;
}

export function recordAdminAuditEvent(event: AdminAuditEvent): void {
  logger.info("admin audit", { ...event });
}

export function createAdminAuditRecorder(
  context: Omit<AdminAuditEvent, "outcome">,
): (outcome: AdminAuditOutcome) => void {
  return (outcome) => recordAdminAuditEvent({ ...context, outcome });
}
