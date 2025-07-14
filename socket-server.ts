// socket-server.ts v.1.2
// Aggiunto un processo in background per la gestione automatica delle aste scadute.
// 1. Importazioni
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { processExpiredAuctionsAndAssignPlayers } from "./src/lib/db/services/bid.service";

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
          io.to(room).emit(event, data);
          console.log(
            `[HTTP->Socket] Emitted event '${event}' to room '${room}'`
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
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
    console.log(
      `[Socket] Utente ${socket.id} si è unito alla stanza: ${roomName}`
    );
  });

  // Evento per lasciare una stanza di lega
  socket.on("leave-league-room", (leagueId: string) => {
    if (!leagueId) return;
    const roomName = `league-${leagueId}`;
    socket.leave(roomName);
    console.log(
      `[Socket] Utente ${socket.id} ha lasciato la stanza: ${roomName}`
    );
  });

  // **NUOVO**: Evento per unirsi alla stanza personale dell'utente (es. 'user-abcxyz')
  socket.on("join-user-room", (userId: string) => {
    if (!userId) return;
    const roomName = `user-${userId}`;
    socket.join(roomName);
    console.log(
      `[Socket] Utente ${socket.id} si è unito alla sua stanza personale: ${roomName}`
    );
  });

  // Gestione della disconnessione
  socket.on("disconnect", () => {
    console.log(`❌ Utente disconnesso: ${socket.id}`);
  });
});

// 6. Avvio del server
httpServer.listen(SOCKET_PORT, () => {
  console.log(
    `🟢 Server Socket.IO in esecuzione su http://localhost:${SOCKET_PORT}`
  );
});

// 7. Processo in Background per Aste Scadute
const AUCTION_PROCESSING_INTERVAL = 15000; // 15 secondi

setInterval(async () => {
  try {
    // console.log("[Background Job] Controllo aste scadute...");
    const result = await processExpiredAuctionsAndAssignPlayers();
    if (result.processedCount > 0) {
      console.log(
        `[Background Job] ✅ Processate ${result.processedCount} aste scadute.`
      );
    }
    if (result.failedCount > 0) {
      console.error(
        `[Background Job] ❌ Fallite ${result.failedCount} aste. Errori:`,
        result.errors
      );
    }
  } catch (error) {
    console.error(
      "[Background Job] Errore critico durante il processo di controllo delle aste:",
      error
    );
  }
}, AUCTION_PROCESSING_INTERVAL);
