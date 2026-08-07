import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { clerkClient } from "@clerk/nextjs/server";
import { shouldEmit } from "./src/lib/socket/dedup.js";

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

export interface SocketServerHandle {
  server: ReturnType<typeof createServer>;
  io: Server;
  port: number;
  close: () => Promise<void>;
}

export async function createSocketServer(
  port: number,
  opts: { emitSecret?: string; allowedOrigins?: string[] } = {},
): Promise<SocketServerHandle> {
  const SOCKET_PORT = port;
  const EMIT_SECRET = opts.emitSecret ?? process.env.SOCKET_EMIT_SECRET;
  const ALLOWED_ORIGINS =
    opts.allowedOrigins ??
    (process.env.ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"))
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

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

  await new Promise<void>((resolve) => httpServer.listen(SOCKET_PORT, resolve));
  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? address.port : SOCKET_PORT;

  return {
    server: httpServer,
    io,
    port: boundPort,
    close: () =>
      new Promise<void>((resolve) => {
        io.close(() => httpServer.close(() => resolve()));
      }),
  };
}

// Production entry point (Dockerfile / Procfile run `node --import tsx socket-server.ts`).
// Under vitest, process.argv[1] is the vitest binary, so this block is skipped.
const isMain = process.argv[1] && process.argv[1].endsWith("socket-server.ts");
if (isMain) {
  const SOCKET_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  createSocketServer(SOCKET_PORT).then(() => {
    console.log(`[SOCKET] Listening on ${SOCKET_PORT}`);
  });
}
