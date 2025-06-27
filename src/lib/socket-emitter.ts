// src/lib/socket-emitter.ts

const SOCKET_SERVER_URL = "http://localhost:3001/api/emit";

interface EmitParams {
  room: string; // Es: 'league-1'
  event: string; // Es: 'auction-update'
  data?: any;
}

export async function notifySocketServer(params: EmitParams) {
  try {
    await fetch(SOCKET_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
  } catch (error) {
    console.error("Error notifying socket server:", error);
    // In un'app di produzione, qui potresti aggiungere un logging più robusto
  }
}
