// ultra-dedup-socket-server.js
// Ultra-aggressive deduplication socket server to catch duplicate auction-created events

import { createServer } from "http";
import { Server } from "socket.io";

// Ultra-aggressive deduplication settings
const SOCKET_PORT = 3001;
const NEXTJS_APP_URL = "http://localhost:3000";

// Multiple layers of deduplication
const auctionCreatedTracker = new Set(); // Permanent tracking
const recentEmissions = new Map(); // Time-based deduplication
const requestCounter = new Map(); // Count requests per auction
const DEDUP_WINDOW_MS = 3000; // 3 second window

console.log("🚀 Starting ULTRA-DEDUP Socket.IO server...");

function generateUltraKey(room, event, data) {
  if (event === 'auction-created' && data && typeof data === 'object') {
    return `${room}:${event}:${data.playerId}:${data.auctionId}`;
  }
  return `${room}:${event}:${JSON.stringify(data)}`;
}

function shouldAllowEmission(room, event, data) {
  const now = Date.now();
  const ultraKey = generateUltraKey(room, event, data);
  
  if (event === 'auction-created' && data && typeof data === 'object') {
    const auctionKey = `${data.playerId}:${data.auctionId}`;
    
    console.log(`[ULTRA-DEDUP] 🔍 CHECKING auction-created for ${auctionKey}`);
    
    // Count total requests for this auction
    const currentCount = requestCounter.get(auctionKey) || 0;
    requestCounter.set(auctionKey, currentCount + 1);
    
    console.log(`[ULTRA-DEDUP] 📊 Request #${currentCount + 1} for auction ${auctionKey}`);
    
    // Check permanent tracker
    if (auctionCreatedTracker.has(auctionKey)) {
      console.error(`[ULTRA-DEDUP] 🚨 PERMANENT BLOCK: auction ${auctionKey} already emitted!`);
      console.error(`[ULTRA-DEDUP] 🚨 This is request #${currentCount + 1} for the same auction`);
      return false;
    }
    
    // Check time-based deduplication
    const lastEmitted = recentEmissions.get(ultraKey);
    if (lastEmitted && (now - lastEmitted) < DEDUP_WINDOW_MS) {
      console.error(`[ULTRA-DEDUP] 🚨 TIME-BASED BLOCK: auction ${auctionKey} emitted ${now - lastEmitted}ms ago`);
      return false;
    }
    
    // Add to both trackers
    auctionCreatedTracker.add(auctionKey);
    recentEmissions.set(ultraKey, now);
    
    console.log(`[ULTRA-DEDUP] ✅ ALLOWING emission for auction ${auctionKey}`);
    console.log(`[ULTRA-DEDUP] ✅ Added to permanent tracker: ${auctionKey}`);
    
    return true;
  }
  
  // Regular deduplication for other events
  const lastEmitted = recentEmissions.get(ultraKey);
  if (lastEmitted && (now - lastEmitted) < DEDUP_WINDOW_MS) {
    console.warn(`[ULTRA-DEDUP] 🚨 Regular event blocked: ${event}`);
    return false;
  }
  
  recentEmissions.set(ultraKey, now);
  return true;
}

// HTTP Server for receiving emission requests
const httpServer = createServer((req, res) => {
  if (req.url === "/api/emit" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { room, event, data } = JSON.parse(body);
        const timestamp = new Date().toISOString();
        
        console.log(`[ULTRA-DEDUP] 📥 HTTP REQUEST at ${timestamp}:`);
        console.log(`[ULTRA-DEDUP] 📥 Room: ${room}, Event: ${event}`);
        
        if (event === 'auction-created') {
          console.log(`[ULTRA-DEDUP] 🎯 AUCTION-CREATED REQUEST DETAILS:`);
          console.log(`[ULTRA-DEDUP] 🎯 PlayerId: ${data?.playerId}`);
          console.log(`[ULTRA-DEDUP] 🎯 AuctionId: ${data?.auctionId}`);
          console.log(`[ULTRA-DEDUP] 🎯 Full Data:`, JSON.stringify(data, null, 2));
        }
        
        if (!shouldAllowEmission(room, event, data)) {
          console.log(`[ULTRA-DEDUP] ❌ EMISSION BLOCKED for ${event}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            success: true, 
            blocked: true, 
            reason: "Blocked by ultra-deduplication" 
          }));
          return;
        }
        
        // Check room clients
        const roomClients = io.sockets.adapter.rooms.get(room);
        const clientCount = roomClients ? roomClients.size : 0;
        
        console.log(`[ULTRA-DEDUP] 🎯 Emitting ${event} to ${clientCount} clients in room ${room}`);
        
        // Emit the event
        io.to(room).emit(event, data);
        
        console.log(`[ULTRA-DEDUP] ✅ EVENT EMITTED: ${event} at ${timestamp}`);
        
        if (event === 'auction-created') {
          console.log(`[ULTRA-DEDUP] 🎉 AUCTION-CREATED SUCCESSFULLY EMITTED:`);
          console.log(`[ULTRA-DEDUP] 🎉 PlayerId: ${data?.playerId}, AuctionId: ${data?.auctionId}`);
        }
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, clientCount, blocked: false }));
        
      } catch (error) {
        console.error("[ULTRA-DEDUP] HTTP Error:", error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Socket.IO Server
const io = new Server(httpServer, {
  cors: {
    origin: NEXTJS_APP_URL,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`[ULTRA-DEDUP] 👤 Client connected: ${socket.id}`);
  
  socket.on("join-league-room", (leagueId) => {
    if (!leagueId) return;
    const roomName = `league-${leagueId}`;
    socket.join(roomName);
    
    const roomClients = io.sockets.adapter.rooms.get(roomName);
    const clientCount = roomClients ? roomClients.size : 0;
    
    console.log(`[ULTRA-DEDUP] 🏠 Client ${socket.id} joined ${roomName} (${clientCount} total)`);
  });
  
  socket.on("disconnect", () => {
    console.log(`[ULTRA-DEDUP] 👋 Client disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(SOCKET_PORT, () => {
  console.log(`🟢 ULTRA-DEDUP Socket.IO server running on http://localhost:${SOCKET_PORT}`);
  console.log(`🔍 Ultra-aggressive deduplication enabled`);
  console.log(`🔍 Tracking auction-created events permanently`);
  console.log(`🔍 Time-based deduplication: ${DEDUP_WINDOW_MS}ms window`);
});

// Periodic stats logging
setInterval(() => {
  console.log(`[ULTRA-DEDUP] 📊 STATS: ${auctionCreatedTracker.size} unique auctions tracked, ${recentEmissions.size} recent emissions`);
}, 30000);