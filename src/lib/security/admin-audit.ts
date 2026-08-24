export type AdminAuditAction = "debug.read" | "admin-task.run";
export type AdminAuditOutcome = "success" | "failure";

interface AdminAuditEvent {
  actorUserId: string;
  action: AdminAuditAction;
  resource: string;
  outcome: AdminAuditOutcome;
}

export function recordAdminAuditEvent(event: AdminAuditEvent): void {
  console.info("[ADMIN_AUDIT]", {
    timestamp: new Date().toISOString(),
    ...event,
  });
}

export function createAdminAuditRecorder(
  context: Omit<AdminAuditEvent, "outcome">,
): (outcome: AdminAuditOutcome) => void {
  return (outcome) => recordAdminAuditEvent({ ...context, outcome });
}
