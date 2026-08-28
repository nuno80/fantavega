import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, execute } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({ db: { execute } }));

function queryResult(rows: Record<string, unknown>[]) {
  return { rows, columns: [], columnTypes: [], lastInsertRowid: undefined, changes: 0 };
}

async function callGet(query = "") {
  const { GET } = await import(
    "@/app/api/leagues/[league-id]/players-with-status/route"
  );
  const request = { nextUrl: new URL(`http://localhost/api/leagues/1/players-with-status${query}`) } as never;
  return GET(request, { params: Promise.resolve({ "league-id": "1" }) } as never);
}

describe("PERF-003 players-with-status input caps", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    execute.mockReset();
    currentUser.mockResolvedValue({ id: "u1" });
    execute.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("league_participants")) return queryResult([{ user_id: "u1" }]);
      if (sql.includes("COUNT(*)")) return queryResult([{ total: 0 }]);
      return queryResult([]);
    });
  });

  it.each([
    "page=0",
    "page=-1",
    "page=abc",
    "limit=0",
    "limit=101",
    "page=10000",
  ])("rejects invalid pagination %s with 400", async (query) => {
    const response = await callGet(`?${query}`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Parametri di paginazione non validi");
  });

  it.each([
    "roles=P,HACKER",
    "roles=DROP TABLE",
    "auctionStatus=nope",
    `teams=${  "x".repeat(3000)}`,
  ])("rejects invalid filter %s with 400", async (query) => {
    const response = await callGet(`?${query}`);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Parametri di filtro non validi");
  });

  it("accepts valid params and clamps oversized search", async () => {
    const response = await callGet(
      `?page=2&limit=50&roles=P,A&search=${  "x".repeat(500)}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metadata).toEqual({ total: 0, page: 2, limit: 50, totalPages: 0 });
    // The data query must carry a positive LIMIT and an offset within the cap.
    const dataCall = execute.mock.calls
      .map(([arg]) => arg as { sql: string; args: unknown[] })
      .find((arg) => arg.sql.includes("LIMIT ? OFFSET ?"));
    expect(dataCall).toBeTruthy();
    expect(Number(dataCall!.args.at(-2))).toBe(50);
    expect(Number(dataCall!.args.at(-1))).toBe(50); // offset = (2-1)*50
  });
});
