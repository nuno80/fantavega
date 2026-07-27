import { createServer } from "http";
import { Server, Socket } from "socket.io";

let recordUserLogout: ((userId: string) => Promise<void>) | null = null;
let startScheduler: (() => void) | null = null;

(async () => {
  try {
    const sessionModule = await import("./src/lib/db/services/session.service.js");
    recordUserLogout = sessionModule.recordUserLogout;
    const schedulerModule = await import("./src/lib/scheduler.js");
    startScheduler = schedulerModule.startScheduler;
    startScheduler?.();
  } catch (error) {
    console.warn("[SOCKET] Could not import services", error);
  }
})();

const SOCKET_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const EMIT_SECRET = process.env.SOCKET_EMIT_SECRET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"))
  .split(",").map((origin) => origin.trim()).filter(Boolean);

const recentEmissions = new Map<string, number>();
const EMISSION_DEDUP_WINDOW_MS = 2_000;

function eventKey(room: string, event: string, data: unknown) {
  return `${room}:${event}:${JSON.stringify(data ?? null)}`;
}

function shouldEmit(room: string, event: string, data: unknown) {
  const key = eventKey(room, event, data);
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

const httpServer = createServer((req, res) => {
  if (req.url !== "/api/emit" || req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }

  if (!EMIT_SECRET || req.headers["x-emit-secret"] !== EMIT_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
    if (body.length > 1_000_000) req.destroy();
  });
  req.on("end", () => {
    try {
      const payload = JSON.parse(body) as { room?: string; event?: string; data?: unknown };
      if (!payload.room || !payload.event) throw new Error("Invalid payload");
      if (!shouldEmit(payload.room, payload.event, payload.data)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, deduplicated: true }));
        return;
      }
      const roomClients = io.sockets.adapter.rooms.get(payload.room);
      io.to(payload.room).emit(payload.event, payload.data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, clientCount: roomClients?.size ?? 0, deduplicated: false }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Invalid request" }));
    }
  });
});

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"], credentials: true },
});

io.on("connection", (socket: Socket) => {
  socket.on("join-user-room", (userId: string) => {
    if (!userId || typeof userId !== "string" || userId.length > 128) return;
    socket.join(`user-${userId}`);
    (socket as Socket & { userId?: string }).userId = userId;
  });

  socket.on("join-league-room", (leagueId: string) => {
    if (!/^\d+$/.test(leagueId)) return;
    socket.join(`league-${leagueId}`);
  });

  socket.on("leave-league-room", (leagueId: string) => {
    if (/^\d+$/.test(leagueId)) socket.leave(`league-${leagueId}`);
  });

  socket.on("disconnect", () => {
    const userId = (socket as Socket & { userId?: string }).userId;
    if (!userId || !recordUserLogout) return;
    setTimeout(async () => {
      if (!io.sockets.adapter.rooms.get(`user-${userId}`)?.size) {
        await recordUserLogout?.(userId);
      }
    }, 10_000);
  });
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(`[SOCKET] Listening on ${SOCKET_PORT}`);
});
