const isRunningOnSocketServer = !!process.env.PORT && !process.env.NEXT_RUNTIME;
const SOCKET_BASE_URL = isRunningOnSocketServer
  ? `http://localhost:${process.env.PORT}`
  : (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001");
const SOCKET_SERVER_URL = `${SOCKET_BASE_URL}/api/emit`;
const SOCKET_EMIT_SECRET = process.env.SOCKET_EMIT_SECRET;

interface EmitParams {
  room: string;
  event: string;
  data?: unknown;
}

const recentEvents = new Map<string, number>();
const THROTTLE_WINDOW_MS = 500;

function generateEventKey(params: EmitParams): string {
  return JSON.stringify({ room: params.room, event: params.event, data: params.data ?? "no-data" });
}

export async function notifySocketServer(params: EmitParams) {
  if (!SOCKET_EMIT_SECRET) {
    throw new Error("SOCKET_EMIT_SECRET is not configured");
  }

  const eventKey = generateEventKey(params);
  const now = Date.now();
  const lastEmitted = recentEvents.get(eventKey);
  const carriesState = Boolean(params.data && typeof params.data === "object" && "budgetUpdates" in params.data);

  if (!carriesState && lastEmitted && now - lastEmitted < THROTTLE_WINDOW_MS) {
    return { success: true, throttled: true };
  }
  recentEvents.set(eventKey, now);

  if (recentEvents.size > 200) {
    const cutoff = now - THROTTLE_WINDOW_MS * 2;
    for (const [key, timestamp] of recentEvents) {
      if (timestamp < cutoff) recentEvents.delete(key);
    }
  }

  const response = await fetch(SOCKET_SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-emit-secret": SOCKET_EMIT_SECRET,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) throw new Error(`Socket server returned HTTP ${response.status}`);
  return response.json();
}
