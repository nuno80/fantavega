// socket-server.ts v.1.3 - Patched with 8dbeada changes
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
const SOCKET_PORT = 3001;
const NEXTJS_APP_URL = "http://localhost:3000";

// 3. Creazione Server HTTP e gestione endpoint per notifiche da Next.js
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
          console.log(
            `[HTTP->Socket] Event data:`,
            JSON.stringify(data, null, 2)
          );

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

          io.to(room).emit(event, data);
          console.log(
            `[HTTP->Socket] Successfully emitted event '${event}' to room '${room}' (${clientCount} clients)`
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, clientCount }));
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
    origin: NEXTJS_APP_URL,
    methods: ["GET", "POST"],
  },
});

console.log("🚀 Avvio del server Socket.IO...");

// 5. Logica di Gestione Connessioni e Stanze
io.on("connection", (socket: Socket) => {
  console.log(`✅ Utente connesso: ${socket.id}`);

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