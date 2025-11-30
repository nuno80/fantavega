// socket-server.ts v.1.3
// Server Socket.IO che gestisce le stanze per le leghe e per i singoli utenti.
// 1. Importazioni
import { createServer } from "http";
import { Server, Socket } from "socket.io";

// Import dinamico per i servizi (ESM compatibility)

let recordUserLogout: ((userId: string) => void) | null = null;
let startScheduler: (() => void) | null = null;

(async () => {
  try {
    const sessionModule = await import(
      "./src/lib/db/services/session.service.js"
    );
    recordUserLogout = sessionModule.recordUserLogout;

    const schedulerModule = await import("./src/lib/scheduler.js");
    startScheduler = schedulerModule.startScheduler;

    // Avvia lo scheduler automatico
    if (startScheduler) {
      startScheduler();
    }
  } catch (error) {
    console.warn("[SOCKET] Could not import services:", error);
  }
})();

// 2. Costanti di Configurazione
const SOCKET_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Support multiple origins for CORS (development + production)
const getAllowedOrigins = (): string[] => {
  const origins = [
    "http://localhost:3000", // Development
  ];

  // Add production origins from environment variable
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
    origins.push(...envOrigins);
  }

  return origins;
};

const ALLOWED_ORIGINS = getAllowedOrigins();
console.log("[SOCKET] Allowed CORS origins:", ALLOWED_ORIGINS);

// 3. Enhanced deduplication mechanism to prevent duplicate emissions
const recentEmissions = new Map<string, number>();
const EMISSION_DEDUP_WINDOW_MS = 2000; // 2 second window for aggressive deduplication

// Additional tracking for auction-created events specifically
const auctionCreatedTracker = new Set<string>();

function generateEmissionKey(room: string, event: string, data: any): string {
  // Create a unique key for deduplication based on room, event, and critical data
  if (event === 'auction-created' && data && typeof data === 'object') {
    // For auction-created events, use playerId and auctionId as key components
    return `${room}:${event}:${data.playerId}:${data.auctionId}`;
  }

  if (event === 'auction-update' && data && typeof data === 'object') {
    // For auction-update events, include bid amount to allow legitimate updates
    return `${room}:${event}:${data.playerId}:${data.newPrice}`;
  }

  // For other events, use full data hash
  return `${room}:${event}:${JSON.stringify(data)}`;
}

function shouldEmitEvent(room: string, event: string, data: any): boolean {
  const emissionKey = generateEmissionKey(room, event, data);
  const now = Date.now();

  // CRITICAL: Special aggressive tracking for auction-created events
  if (event === 'auction-created' && data && typeof data === 'object') {
    const auctionKey = `${data.playerId}:${data.auctionId}`;

    if (auctionCreatedTracker.has(auctionKey)) {
      console.error(`[SOCKET DEDUP] 🚨 CRITICAL: auction-created DUPLICATE detected for auction ${auctionKey}!`);
      console.error(`[SOCKET DEDUP] This auction-created event was already emitted. Blocking duplicate.`);
      return false;
    }

    // Mark this auction as emitted (permanent tracking)
    auctionCreatedTracker.add(auctionKey);
    console.log(`[SOCKET DEDUP] ✅ auction-created tracking: Added ${auctionKey} to permanent tracker`);

    // Clean up old auction tracking periodically to prevent memory growth
    if (auctionCreatedTracker.size > 1000) {
      // Remove oldest 200 entries (simple cleanup - in production use a more sophisticated LRU)
      const entries = Array.from(auctionCreatedTracker);
      for (let i = 0; i < 200; i++) {
        auctionCreatedTracker.delete(entries[i]);
      }
      console.log(`[SOCKET DEDUP] Cleaned auction tracker, now has ${auctionCreatedTracker.size} entries`);
    }
  }

  // Regular time-based deduplication for all events
  const lastEmitted = recentEmissions.get(emissionKey);

  if (lastEmitted && (now - lastEmitted) < EMISSION_DEDUP_WINDOW_MS) {
    console.warn(`[SOCKET DEDUP] Blocking duplicate emission within ${EMISSION_DEDUP_WINDOW_MS}ms window:`, {
      room,
      event,
      emissionKey,
      timeSinceLastEmit: now - lastEmitted,
      data: event === 'auction-created' ? { playerId: data?.playerId, auctionId: data?.auctionId } : 'other'
    });
    return false;
  }

  // Update emission tracking
  recentEmissions.set(emissionKey, now);

  // Clean up old entries to prevent memory growth
  if (recentEmissions.size > 200) {
    const cutoff = now - EMISSION_DEDUP_WINDOW_MS * 2;
    for (const [key, timestamp] of recentEmissions.entries()) {
      if (timestamp < cutoff) {
        recentEmissions.delete(key);
      }
    }
  }

  return true;
}

// 4. Creazione Server HTTP e gestione endpoint per notifiche da Next.js
const httpServer = createServer((req, res) => {
  if (req.url === "/api/emit" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { room, event, data } = JSON.parse(body);
        if (room && event) {
          console.log(
            `[HTTP->Socket] Received emit request for room '${room}', event '${event}'`
          );

          // Special logging for auction-created events
          if (event === 'auction-created' && data && typeof data === 'object') {
            console.log(
              `[HTTP->Socket] 🚨 AUCTION-CREATED REQUEST for player ${data.playerId}, auction ${data.auctionId} at ${new Date().toISOString()}`
            );
            console.log(`[HTTP->Socket] 🚶 Request body:`, JSON.stringify(data, null, 2));
          }

          // Check deduplication before emitting
          if (!shouldEmitEvent(room, event, data)) {
            console.log(
              `[HTTP->Socket] ❌ DUPLICATE BLOCKED: Event '${event}' for room '${room}' blocked by deduplication`
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              success: true,
              deduplicated: true,
              message: "Event blocked as duplicate"
            }));
            return;
          }

          // Check how many clients are in the room
          const roomClients = io.sockets.adapter.rooms.get(room);
          const clientCount = roomClients ? roomClients.size : 0;
          console.log(
            `[HTTP->Socket] Room '${room}' has ${clientCount} connected clients`
          );

          if (clientCount === 0) {
            console.warn(
              `[HTTP->Socket] WARNING: No clients in room '${room}' to receive event '${event}'`
            );
          }

          // Emit the event
          io.to(room).emit(event, data);
          console.log(
            `[HTTP->Socket] ✅ Successfully emitted event '${event}' to room '${room}' (${clientCount} clients)`
          );

          // Special success logging for auction-created events
          if (event === 'auction-created') {
            console.log(
              `[HTTP->Socket] 🎯 AUCTION-CREATED SUCCESSFULLY EMITTED for player ${data?.playerId} at ${new Date().toISOString()}`
            );
            console.log(`[HTTP->Socket] ✅ Emission complete for auction ${data?.auctionId}, ${clientCount} clients notified`);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, clientCount, deduplicated: false }));
        } else {
          throw new Error("Richiesta invalida: room o event mancanti.");
        }
      } catch (error) {
        console.error("[HTTP->Socket] Errore elaborazione richiesta:", error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: false,
            message: "Corpo della richiesta non valido.",
          })
        );
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// 4. Inizializzazione Server Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: true, // Allow all origins temporarily for debugging
    methods: ["GET", "POST"],
    credentials: true,
  },
});

console.log("🚀 Avvio del server Socket.IO...");

// 5. Logica di Gestione Connessioni e Stanze
io.on("connection", (socket: Socket) => {
  console.log(`✅ Utente connesso: ${socket.id}`);

  // **GENERIC**: Evento generico per unirsi a qualsiasi stanza
  socket.on("join-room", (roomName: string) => {
    if (!roomName) return;
    socket.join(roomName);

    // Log room info after joining
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;

    console.log(
      `[Socket] Client ${socket.id} joined room: ${roomName} (now ${clientCount} clients total)`
    );

    // Confirm join to client
    socket.emit("room-joined", { room: roomName });
  });

  // **GENERIC**: Evento generico per lasciare qualsiasi stanza
  socket.on("leave-room", (roomName: string) => {
    if (!roomName) return;
    socket.leave(roomName);

    // Log room info after leaving
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;

    console.log(
      `[Socket] Client ${socket.id} left room: ${roomName} (now ${clientCount} clients remaining)`
    );
  });

  // Evento per unirsi a una stanza di lega (es. 'league-123')
  socket.on("join-league-room", (leagueId: string) => {
    if (!leagueId) return;
    const roomName = `league-${leagueId}`;
    socket.join(roomName);

    // Log room info after joining
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;

    console.log(
      `[Socket] Client ${socket.id} joined room: ${roomName} (now ${clientCount} clients total)`
    );

    // List all clients in room for debugging
    if (roomClients) {
      const clientIds = Array.from(roomClients);
      console.log(`[Socket] Room '${roomName}' clients:`, clientIds);
    }

    // Confirm join to client
    socket.emit("room-joined", { room: roomName });
  });

  // Evento per lasciare una stanza di lega
  socket.on("leave-league-room", (leagueId: string) => {
    if (!leagueId) return;
    const roomName = `league-${leagueId}`;
    socket.leave(roomName);

    // Log room info after leaving
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;

    console.log(
      `[Socket] Client ${socket.id} left room: ${roomName} (now ${clientCount} clients remaining)`
    );
  });

  // **NUOVO**: Evento per unirsi alla stanza personale dell'utente (es. 'user-abcxyz')
  socket.on("join-user-room", (userId: string) => {
    if (!userId) return;
    const roomName = `user-${userId}`;
    socket.join(roomName);
    // Salva userId nel socket per il logout
    (socket as any).userId = userId;
    console.log(
      `[Socket] Utente ${socket.id} si è unito alla sua stanza personale: ${roomName}`
    );
  });

  // Gestione della disconnessione
  socket.on("disconnect", () => {
    console.log(`❌ Utente disconnesso: ${socket.id}`);

    // Registra logout se abbiamo l'userId
    const userId = (socket as any).userId;
    if (userId && recordUserLogout) {
      try {
        recordUserLogout(userId);
      } catch (error) {
        console.error("[SOCKET] Error recording logout:", error);
      }
    }
  });
});

// 6. Avvio del server
httpServer.listen(SOCKET_PORT, () => {
  console.log(
    `🟢 Server Socket.IO in esecuzione su http://localhost:${SOCKET_PORT}`
  );
});
