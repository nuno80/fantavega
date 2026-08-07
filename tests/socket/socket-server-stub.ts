// Test-only bootstrap for socket-server.ts: starts the real server on an
// ephemeral port and returns a handle, without touching the prod entry point.
import { createSocketServer, type SocketServerHandle } from "../../socket-server.js";

export async function startSocketServerForTest(): Promise<SocketServerHandle> {
  return createSocketServer(0);
}
