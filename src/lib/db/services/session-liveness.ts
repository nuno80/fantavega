export const SESSION_STALENESS_SECONDS = 120;

export function isHeartbeatFresh(lastHeartbeat: number | null, now: number): boolean {
  return lastHeartbeat !== null && lastHeartbeat > now - SESSION_STALENESS_SECONDS;
}

export function getTimerActivationTime(now: number): number {
  return now;
}

export function getGhostSessionEnd(lastHeartbeat: number | null, sessionStart: number): number {
  return lastHeartbeat ?? sessionStart;
}
