// src/lib/socket/server-logic.ts
// Logica pura per il socket server: cache di deduplicazione emissioni
// e tracciamento dei timer di disconnect per utente.
// Separata da socket-server.ts per essere testabile senza socket.io.

export interface DedupCacheOptions {
  windowMs: number;
  maxSize: number;
}

// Estrae una chiave business stabile dal payload (se possibile), evitando
// di dipendere dall'ordine delle proprietà di JSON.stringify.
export function buildDedupKey(
  room: string,
  event: string,
  data: unknown
): string {
  const base = `${room}:${event}`;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const stable =
      record.auctionId ??
      record.auction_id ??
      record.playerId ??
      record.player_id ??
      record.userId ??
      record.user_id ??
      record.leagueId ??
      record.league_id;
    if (typeof stable === "string" || typeof stable === "number") {
      return `${base}:${String(stable)}`;
    }
  }
  return `${base}:${JSON.stringify(data ?? null)}`;
}

export function createDedupCache(options: DedupCacheOptions) {
  const entries = new Map<string, number>();

  const evictOldest = () => {
    // Pulizia deterministica: rimuove la voce più vecchia (FIFO per inserimento).
    if (entries.size >= options.maxSize) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
  };

  return {
    shouldEmit(room: string, event: string, data: unknown): boolean {
      const key = buildDedupKey(room, event, data);
      const now = Date.now();
      const last = entries.get(key);
      if (last !== undefined && now - last < options.windowMs) return false;
      entries.set(key, now);
      evictOldest();
      return true;
    },
    size(): number {
      return entries.size;
    },
  };
}

export interface DisconnectTrackerOptions {
  recordUserLogout: (userId: string, notAfter?: number) => Promise<void>;
  hasUserSockets: (userId: string) => boolean;
  now: () => number;
  delayMs: number;
}

export function createDisconnectTracker(options: DisconnectTrackerOptions) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const scheduleLogout = (userId: string) => {
    const notAfter = Math.floor(options.now() / 1000);
    const existing = timers.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      timers.delete(userId);
      if (options.hasUserSockets(userId)) return;
      void (async () => {
        try {
          await options.recordUserLogout(userId, notAfter);
        } catch (error) {
          console.error(`[SOCKET] Error recording logout for ${userId}:`, error);
        }
      })();
    }, options.delayMs);
    timers.set(userId, timer);
  };

  return {
    onDisconnect(userId: string) {
      scheduleLogout(userId);
    },
    // L'utente è rientrato nella stessa room: cancella il timer pendente.
    onReconnect(userId: string) {
      const existing = timers.get(userId);
      if (existing) {
        clearTimeout(existing);
        timers.delete(userId);
      }
    },
    size(): number {
      return timers.size;
    },
  };
}
