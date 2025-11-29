// src/lib/socket-emitter.ts

const SOCKET_BASE_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
const SOCKET_SERVER_URL = `${SOCKET_BASE_URL}/api/emit`;

// Throttling mechanism to prevent duplicate events
const recentEvents = new Map<string, number>();
const THROTTLE_WINDOW_MS = 500; // 500ms throttle window for robust duplicate prevention

interface EmitParams {
  room: string; // Es: 'league-1'
  event: string; // Es: 'auction-update'
  data?: unknown;
}

function generateEventKey(params: EmitParams): string {
  // Create a unique key for throttling based on room, event, and exact data
  const keyData = {
    room: params.room,
    event: params.event,
    // Use exact data hash for precise duplicate detection
    dataHash: params.data ? JSON.stringify(params.data) : "no-data",
  };
  return JSON.stringify(keyData);
}

export async function notifySocketServer(params: EmitParams) {
  // CRITICAL: Special tracking for auction-created events to debug duplicates
  if (
    params.event === "auction-created" &&
    params.data &&
    typeof params.data === "object" &&
    "playerId" in params.data
  ) {
    console.log(
      `[Socket Emitter] 🚨 AUCTION-CREATED EVENT DETECTED for player ${params.data.playerId}:`,
      {
        timestamp: new Date().toISOString(),
        params,
        stackTrace: new Error("Stack trace for auction-created event").stack
          ?.split("\n")
          .slice(0, 10),
      }
    );
  }

  // Throttling check
  const eventKey = generateEventKey(params);
  const now = Date.now();
  const lastEmitted = recentEvents.get(eventKey);

  if (lastEmitted && now - lastEmitted < THROTTLE_WINDOW_MS) {
    console.warn(
      "[Socket Emitter] THROTTLED: Duplicate event blocked within throttle window:",
      {
        eventKey,
        timeSinceLastEmit: now - lastEmitted,
        throttleWindow: THROTTLE_WINDOW_MS,
        params,
      }
    );

    // CRITICAL: Log throttled auction-created events specifically
    if (params.event === "auction-created") {
      console.error(
        `[Socket Emitter] 🚨 THROTTLED AUCTION-CREATED EVENT! This suggests rapid duplicate calls.`
      );
    }

    // NUOVO LOG DI DEBUG per il problema dei crediti
    if (
      params.event === "auction-update" &&
      params.data &&
      typeof params.data === "object" &&
      "budgetUpdates" in params.data &&
      (params.data as { budgetUpdates: unknown[] }).budgetUpdates.length > 0
    ) {
      console.error(
        `[Socket Emitter] 🚨 CRITICAL DEBUG: Un evento 'auction-update' con 'budgetUpdates' è stato bloccato dal throttling!`,
        { eventKey }
      );
    }

    return { success: true, throttled: true };
  }

  // Update throttle tracking
  recentEvents.set(eventKey, now);

  // Clean up old entries (keep map from growing indefinitely)
  if (recentEvents.size > 100) {
    const cutoff = now - THROTTLE_WINDOW_MS * 2;
    for (const [key, timestamp] of recentEvents.entries()) {
      if (timestamp < cutoff) {
        recentEvents.delete(key);
      }
    }
  }

  try {
    console.log("[Socket Emitter] Sending event to Socket.IO server:", {
      url: SOCKET_SERVER_URL,
      params,
    });

    const response = await fetch(SOCKET_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("[Socket Emitter] Socket.IO server response:", result);

    return result;
  } catch (error) {
    console.error("[Socket Emitter] Error notifying socket server:", error);
    console.error("[Socket Emitter] Failed to emit event:", params);
    // In un'app di produzione, qui potresti aggiungere un logging più robusto
    throw error; // Re-throw to allow calling code to handle the error
  }
}
