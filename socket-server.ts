import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { clerkClient } from "@clerk/nextjs/server";
import { shouldEmit } from "./src/lib/socket/dedup.js";

let recordUserLogout: ((userId: string, notAfter?: number) => Promise<void>) | null = null;
let hasLeagueAccess: ((userId: string, leagueId: number, role?: string) => Promise<boolean>) | null = null;
let startScheduler: (() => void) | null = null;

(async () => {
  try {
    const sessionModule = await import("@/lib/db/services/session.service");
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

export interface SocketServerOptions {
  emitSecret?: string;
  allowedOrigins?: string[];
  disconnectTimeoutMs?: number;
}

export async function createSocketServer(
  port: number,
  opts: SocketServerOptions = {},
): Promise<SocketServerHandle> {
  const SOCKET_PORT = port;
  const EMIT_SECRET = opts.emitSecret ?? process.env.SOCKET_EMIT_SECRET;
  const disconnectTimeoutMs = opts.disconnectTimeoutMs ?? 10_000;
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
        console.log(`[DEBUG-SOCKET-SRV] /api/emit room=${payload.room} event=${payload.event} clients=${roomClients?.size ?? 0}`);
        io.to(payload.room).emit(payload.event, payload.data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, clientCount: roomClients?.size ?? 0, deduplicated: false }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid request" }));
      }
    });
  });

  const userSockets = new Map<string, Set<string>>();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    const userId = socket.data.userId as string | undefined;
    console.log(`[DEBUG-SOCKET-SRV] connection socketId=${socket.id} userId=${userId}`);
    if (userId) {
      const sockets = userSockets.get(userId) ?? new Set<string>();
      sockets.add(socket.id);
      userSockets.set(userId, sockets);

      // A reconnect cancels the pending logout.
      const timer = disconnectTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(userId);
      }
    }

    socket.on("join-user-room", () => {
      const uid = socket.data.userId as string | undefined;
      if (uid) socket.join(`user-${uid}`);
    });

    socket.on("join-league-room", async (leagueId: string) => {
      const uid = socket.data.userId as string | undefined;
      console.log(`[DEBUG-SOCKET-SRV] join-league-room user=${uid} league=${leagueId}`);
      if (!uid || !/^\d+$/.test(leagueId) || !hasLeagueAccess) return;
      const hasAccess = await hasLeagueAccess(uid, Number(leagueId));
      console.log(`[DEBUG-SOCKET-SRV] join-league-room user=${uid} league=${leagueId} access=${hasAccess}`);
      if (hasAccess) socket.join(`league-${leagueId}`);
    });

    socket.on("leave-league-room", (leagueId: string) => {
      if (/^\d+$/.test(leagueId)) socket.leave(`league-${leagueId}`);
    });

    socket.on("disconnect", () => {
      const uid = socket.data.userId as string | undefined;
      const disconnectedAt = Math.floor(Date.now() / 1000);
      if (!uid) return;

      const sockets = userSockets.get(uid);
      if (!sockets) return;
      sockets.delete(socket.id);
      if (sockets.size === 0) userSockets.delete(uid);
      if (sockets.size > 0) return;

      // Last socket for this user is gone: schedule the logout.
      const timer = setTimeout(async () => {
        try {
          if (!userSockets.get(uid)?.size) await recordUserLogout?.(uid, disconnectedAt);
        } catch (error) {
          console.error("[SOCKET] disconnect logout failed", error);
        } finally {
          // Guard against a stale callback clearing a newer timer.
          if (disconnectTimers.get(uid) === timer) disconnectTimers.delete(uid);
        }
      }, disconnectTimeoutMs);
      disconnectTimers.set(uid, timer);
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
        for (const timer of disconnectTimers.values()) clearTimeout(timer);
        disconnectTimers.clear();
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
