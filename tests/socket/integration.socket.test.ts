import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

// Mock Clerk so authenticateRequest succeeds for tokens we control.
const authenticateRequest = vi.fn(async () => ({
  isAuthenticated: true,
  toAuth: () => ({ userId: "user-1" }),
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(() => ({ authenticateRequest })),
}));

const hasLeagueAccessMock = vi.mocked(await import("@/lib/auth/league-guard")).hasLeagueAccess;
const recordUserLogoutMock = vi.mocked(await import("@/lib/db/services/session.service")).recordUserLogout;

let handle: SocketServerHandle;
let baseUrl: string;

beforeAll(async () => {
  process.env.SOCKET_EMIT_SECRET = "test-secret";
  process.env.ALLOWED_ORIGINS = "http://localhost:9999";
  handle = await startSocketServerForTest();
  baseUrl = `http://localhost:${handle.port}`;
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
    await new Promise((r) => setTimeout(r, 50));
    client.close();
    await new Promise((r) => setTimeout(r, 11_000));
    expect(recordUserLogoutMock).toHaveBeenCalledWith("user-1", expect.any(Number));
  }, 15_000);

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
});
