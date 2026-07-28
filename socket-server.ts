import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { clerkClient } from "@clerk/nextjs/server";

let recordUserLogout: ((userId: string, notAfter?: number) => Promise<void>) | null = null;
let hasLeagueAccess: ((userId: string, leagueId: number, role?: string) => Promise<boolean>) | null = null;
let startScheduler: (() => void) | null = null;

(async () => {
  try {
    const sessionModule = await import("./src/lib/db/services/session.service.js");
    recordUserLogout = sessionModule.recordUserLogout;
    const guardModule = await import("./src/lib/auth/league-guard.js");
    hasLeagueAccess = guardModule.hasLeagueAccess;
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

function shouldEmit(room: string, event: string, data: unknown) {
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

const httpServer = createServer((req, res) => {
  if (req.url !== "/api/emit" || req.method !== "POST") {
    res.writeHead(404); res.end(); return;
  }
  if (!EMIT_SECRET || req.headers["x-emit-secret"] !== EMIT_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Unauthorized" })); return;
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
        res.end(JSON.stringify({ success: true, deduplicated: true })); return;
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

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) return next(new Error("unauthorized"));
    const client = await clerkClient();
    const request = new Request("http://socket.local", { headers: { Authorization: `Bearer ${token}` } });
    const state = await client.authenticateRequest(request, { authorizedParties: ALLOWED_ORIGINS });
    if (!state.isAuthenticated) return next(new Error("unauthorized"));
    socket.data.userId = state.toAuth().userId;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket: Socket) => {
  socket.on("join-user-room", () => {
    const userId = socket.data.userId as string | undefined;
    if (userId) socket.join(`user-${userId}`);
  });

  socket.on("join-league-room", async (leagueId: string) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId || !/^\d+$/.test(leagueId) || !hasLeagueAccess) return;
    if (await hasLeagueAccess(userId, Number(leagueId))) socket.join(`league-${leagueId}`);
  });

  socket.on("leave-league-room", (leagueId: string) => {
    if (/^\d+$/.test(leagueId)) socket.leave(`league-${leagueId}`);
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId as string | undefined;
    const disconnectedAt = Math.floor(Date.now() / 1000);
    if (!userId || !recordUserLogout) return;
    setTimeout(async () => {
      if (!io.sockets.adapter.rooms.get(`user-${userId}`)?.size) await recordUserLogout?.(userId, disconnectedAt);
    }, 10_000);
  });
});

httpServer.listen(SOCKET_PORT, () => console.log(`[SOCKET] Listening on ${SOCKET_PORT}`));
