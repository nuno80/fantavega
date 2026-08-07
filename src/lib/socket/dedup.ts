export const EMISSION_DEDUP_WINDOW_MS = 2_000;
const recentEmissions = new Map<string, number>();

export function shouldEmit(room: string, event: string, data: unknown) {
  const key = `${room}:${event}:${JSON.stringify(data ?? null)}`;
  const now = Date.now();
  const last = recentEmissions.get(key);
  if (last && now - last < EMISSION_DEDUP_WINDOW_MS) return false;
  recentEmissions.set(key, now);
  if (recentEmissions.size > 500) {
    for (const [oldKey, timestamp] of recentEmissions) {
      if (timestamp < now - EMISSION_DEDUP_WINDOW_MS * 2) recentEmissions.delete(oldKey);
    }
  }
  return true;
}

export function clearRecentEmissionsForTest() {
  recentEmissions.clear();
}
