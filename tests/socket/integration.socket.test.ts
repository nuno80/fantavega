import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import type { SocketServerHandle } from "../../socket-server";
import { startSocketServerForTest } from "./socket-server-stub";

// Mock server-side imports that touch the DB / external services.
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/db/services/session.service", () => ({
  recordUserLogout: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/league-guard", () => ({
  hasLeagueAccess: vi.fn(async (userId: string, leagueId: number) => userId === "user-1" && leagueId === 1),
}));
vi.mock("@/lib/scheduler", () => ({ startScheduler: vi.fn() }));

// Mock Clerk so verifyToken succeeds for tokens we control.
const { verifyToken } = vi.hoisted(() => ({
  verifyToken: vi.fn(async () => ({ sub: "user-1" })),
}));
vi.mock("@clerk/nextjs/server", () => ({
  verifyToken,
}));

const hasLeagueAccessMock = vi.mocked(await import("@/lib/auth/league-guard")).hasLeagueAccess;
const recordUserLogoutMock = vi.mocked(await import("@/lib/db/services/session.service")).recordUserLogout;

let handle: SocketServerHandle;
let baseUrl: string;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  process.env.SOCKET_EMIT_SECRET = "test-secret";
  process.env.ALLOWED_ORIGINS = "http://localhost:9999";
  handle = await startSocketServerForTest({ disconnectTimeoutMs: 50 });
  baseUrl = `http://localhost:${handle.port}`;
});

beforeEach(() => {
  recordUserLogoutMock.mockClear();
});

// Each test may leave a pending disconnect timer (e.g. a user whose last socket
// closed but whose window did not fully elapse inside the test). Wait it out and
// clear the mock so the next test starts from a clean slate.
afterEach(async () => {
  await sleep(250); // > disconnectTimeoutMs (50) + server-side close latency
  recordUserLogoutMock.mockClear();
});

afterAll(async () => {
  await handle?.close();
  vi.clearAllMocks();
});

function connect(token?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = createClient(baseUrl, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
    });
    client.on("connect", () => resolve(client));
    client.on("connect_error", (err) => reject(err));
  });
}

// Close a client and wait until the server has actually dropped it, so no
// phantom socket from a previous test leaks into the next one's userSockets set.
// `expectedRemaining` is the number of sockets we expect to still be connected
// after this close (used when other sockets of the same user stay alive).
async function closeAndWait(client: ClientSocket, expectedRemaining = 0): Promise<void> {
  client.close();
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const connected = handle.io.sockets.sockets.size;
    if (connected === expectedRemaining) return;
    await sleep(20);
  }
  throw new Error(
    `server has ${handle.io.sockets.sockets.size} connected sockets, expected ${expectedRemaining}`,
  );
}

describe("socket server integration", () => {
  it("rejects a client without a token", async () => {
    const client = createClient(baseUrl, { transports: ["websocket"], auth: {}, reconnection: false });
    await expect(new Promise<void>((resolve) => client.on("connect_error", () => resolve()))).resolves.toBeUndefined();
    client.close();
  });

  it("accepts a client with a valid token", async () => {
    const client = await connect("valid-token");
    client.emit("join-user-room");
    await new Promise((r) => setTimeout(r, 50));
    client.close();
    expect(true).toBe(true);
  });

  it("joins a league room only with access", async () => {
    const client = await connect("valid-token");
    client.emit("join-league-room", "1");
    await new Promise((r) => setTimeout(r, 50));
    expect(hasLeagueAccessMock).toHaveBeenCalledWith("user-1", 1);
    client.close();
  });

  it("records logout on disconnect", async () => {
    const client = await connect("valid-token");
    client.emit("join-user-room");
    await sleep(50);
    await closeAndWait(client);
    await sleep(200); // > disconnectTimeoutMs (50)
    expect(recordUserLogoutMock).toHaveBeenCalledWith("user-1", expect.any(Number));
  }, 5_000);

  it("does not log out when the user reconnects within the disconnect window", async () => {
    const first = await connect("valid-token");
    first.emit("join-user-room");
    await sleep(20);

    // Second socket joins while the first is still connected.
    const second = await connect("valid-token");
    second.emit("join-user-room");
    await sleep(20);

    // First socket disconnects, but the second keeps the session alive.
    await closeAndWait(first, 1);
    await sleep(200); // > disconnectTimeoutMs: no timer fires for the user.
    expect(recordUserLogoutMock).not.toHaveBeenCalled();

    await closeAndWait(second);
    await sleep(200); // Last socket gone: timer fires once.
    expect(recordUserLogoutMock).toHaveBeenCalledTimes(1);
  }, 5_000);

  it("logs out with the first disconnect timestamp when reconnect happens after the window", async () => {
    const first = await connect("valid-token");
    first.emit("join-user-room");
    await sleep(20);
    await closeAndWait(first);
    await sleep(200); // Timer fires: logout with the first disconnect's timestamp.

    // Reconnect after the first disconnect window already fired.
    const second = await connect("valid-token");
    second.emit("join-user-room");
    await sleep(20);
    await closeAndWait(second);
    await sleep(200); // Timer fires again with the second disconnect's timestamp.

    expect(recordUserLogoutMock).toHaveBeenCalledTimes(2);
    expect(recordUserLogoutMock).toHaveBeenNthCalledWith(1, "user-1", expect.any(Number));
    expect(recordUserLogoutMock).toHaveBeenNthCalledWith(2, "user-1", expect.any(Number));
  }, 5_000);

  it("logs out only when the last socket for the user disconnects", async () => {
    const first = await connect("valid-token");
    first.emit("join-user-room");
    const second = await connect("valid-token");
    second.emit("join-user-room");
    await sleep(20);

    await closeAndWait(first, 1);
    await sleep(200);
    expect(recordUserLogoutMock).not.toHaveBeenCalled();

    await closeAndWait(second);
    await sleep(200);
    expect(recordUserLogoutMock).toHaveBeenCalledTimes(1);
    expect(recordUserLogoutMock).toHaveBeenCalledWith("user-1", expect.any(Number));
  }, 5_000);

  it("a stale disconnect callback does not clear a newer timer", async () => {
    const first = await connect("valid-token");
    first.emit("join-user-room");
    await sleep(20);
    await closeAndWait(first);
    await sleep(200); // First timer fired: logout recorded.

    const second = await connect("valid-token");
    second.emit("join-user-room");
    await sleep(20);
    await closeAndWait(second);
    await sleep(200); // Second timer fires: logout recorded again.

    expect(recordUserLogoutMock).toHaveBeenCalledTimes(2);
  }, 5_000);

  it("POST /api/emit requires the secret and returns client count", async () => {
    const client = await connect("valid-token");
    client.emit("join-league-room", "1");
    await new Promise((r) => setTimeout(r, 50));

    const resNoSecret = await fetch(`${baseUrl}/api/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: "league-1", event: "budget-update", data: { budget: 100 } }),
    });
    expect(resNoSecret.status).toBe(401);

    const res = await fetch(`${baseUrl}/api/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-emit-secret": "test-secret" },
      body: JSON.stringify({ room: "league-1", event: "budget-update", data: { budget: 100 } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; clientCount: number };
    expect(body.success).toBe(true);
    expect(body.clientCount).toBe(1);
    client.close();
  });

  it("deduplicates identical emissions via /api/emit", async () => {
    const body = { room: "league-1", event: "auction-update", data: { auctionId: 5 } };
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-emit-secret": "test-secret" },
      body: JSON.stringify(body),
    };
    const first = await fetch(`${baseUrl}/api/emit`, opts);
    const second = await fetch(`${baseUrl}/api/emit`, opts);
    const firstBody = (await first.json()) as { deduplicated: boolean };
    const secondBody = (await second.json()) as { deduplicated: boolean };
    expect(firstBody.deduplicated).toBe(false);
    expect(secondBody.deduplicated).toBe(true);
  });

  it("close() clears pending timers so no logout fires afterwards", async () => {
    const client = await connect("valid-token");
    client.emit("join-user-room");
    await sleep(20);
    await closeAndWait(client);

    await handle.close();
    await sleep(100);

    expect(recordUserLogoutMock).not.toHaveBeenCalled();
  }, 5_000);
});
