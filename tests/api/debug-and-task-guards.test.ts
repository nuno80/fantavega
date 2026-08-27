import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  currentUser,
  dbExecute,
  processExpiredAuctionsAndAssignPlayers,
  processExpiredComplianceTimers,
  processExpiredResponseTimers,
} = vi.hoisted(() => ({
  currentUser: vi.fn(),
  dbExecute: vi.fn(),
  processExpiredAuctionsAndAssignPlayers: vi.fn(),
  processExpiredComplianceTimers: vi.fn(),
  processExpiredResponseTimers: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db", () => ({ db: { execute: dbExecute } }));
vi.mock("@/lib/db/services/penalty.service", () => ({ processExpiredComplianceTimers }));
vi.mock("@/lib/db/services/response-timer.service", () => ({ processExpiredResponseTimers }));
vi.mock("@/lib/db/services/bid.service", () => ({ processExpiredAuctionsAndAssignPlayers }));

function spyAuditLog() {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(String(args[0]));
  });
  return {
    expectAudit: (fields: Record<string, unknown>) => {
      const parsed = lines
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is Record<string, unknown> => entry !== null);
      expect(parsed).toContainEqual(expect.objectContaining(fields));
    },
  };
}

describe("debug and scheduled-task route guards", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    dbExecute.mockReset();
    processExpiredAuctionsAndAssignPlayers.mockReset();
    processExpiredComplianceTimers.mockReset();
    processExpiredResponseTimers.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const callers = [
    { label: "anonymous", user: null, expectedStatus: 401 },
    {
      label: "manager",
      user: { id: "manager-1", publicMetadata: { role: "manager" } },
      expectedStatus: 403,
    },
    {
      label: "admin",
      user: { id: "admin-1", publicMetadata: { role: "admin" } },
      expectedStatus: 200,
    },
  ] as const;

  it.each(callers)(
    "enforces the $label matrix before the all-autobids debug query",
    async ({ user, expectedStatus }) => {
      currentUser.mockResolvedValue(user);
      dbExecute.mockResolvedValue({ rows: [] });
      const { NextRequest } = await import("next/server");
      const { GET } = await import("@/app/api/debug/all-autobids/route");

      const response = await GET(
        new NextRequest("http://localhost/api/debug/all-autobids?leagueId=2"),
      );

      expect(response.status).toBe(expectedStatus);
      expect(dbExecute).toHaveBeenCalledTimes(expectedStatus === 200 ? 2 : 0);
    },
  );

  const productionDebugRoutes = [
    {
      label: "all-autobids",
      invoke: async () => {
        const { NextRequest } = await import("next/server");
        const { GET } = await import("@/app/api/debug/all-autobids/route");
        return GET(new NextRequest("http://localhost/api/debug/all-autobids?leagueId=2"));
      },
    },
    {
      label: "autobid-check",
      invoke: async () => {
        const { NextRequest } = await import("next/server");
        const { GET } = await import("@/app/api/debug/autobid-check/route");
        return GET(new NextRequest("http://localhost/api/debug/autobid-check?leagueId=2"));
      },
    },
    {
      label: "budget-verification",
      invoke: async () => {
        const { GET } = await import("@/app/api/debug/budget-verification/route");
        return GET(new Request("http://localhost/api/debug/budget-verification?leagueId=2"));
      },
    },
  ] as const;

  it.each(productionDebugRoutes)(
    "returns not found for $label when debug APIs are disabled in production",
    async ({ invoke }) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ENABLE_DEBUG_API", "false");
      currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });

      const response = await invoke();

      expect(response.status).toBe(404);
      expect(dbExecute).not.toHaveBeenCalled();
    },
  );

  const productionCallers = [
    { label: "anonymous", user: null, debugEnabled: false, expectedStatus: 401 },
    {
      label: "manager",
      user: { id: "manager-1", publicMetadata: { role: "manager" } },
      debugEnabled: false,
      expectedStatus: 403,
    },
    {
      label: "admin with debug disabled",
      user: { id: "admin-1", publicMetadata: { role: "admin" } },
      debugEnabled: false,
      expectedStatus: 404,
    },
    {
      label: "admin with debug enabled",
      user: { id: "admin-1", publicMetadata: { role: "admin" } },
      debugEnabled: true,
      expectedStatus: 200,
    },
  ] as const;

  it.each(productionCallers)(
    "enforces the $label matrix in production",
    async ({ user, debugEnabled, expectedStatus }) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ENABLE_DEBUG_API", debugEnabled ? "true" : "false");
      currentUser.mockResolvedValue(user);
      dbExecute.mockResolvedValue({ rows: [] });
      const { NextRequest } = await import("next/server");
      const { GET } = await import("@/app/api/debug/all-autobids/route");

      const response = await GET(
        new NextRequest("http://localhost/api/debug/all-autobids?leagueId=2"),
      );

      expect(response.status).toBe(expectedStatus);
      expect(dbExecute).toHaveBeenCalledTimes(expectedStatus === 200 ? 2 : 0);
    },
  );

  it("allowlists debug response fields and records the admin access", async () => {
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    dbExecute
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            auction_id: 8,
            user_id: "user-1",
            is_active: 1,
            created_at: 10,
            player_id: 11,
            player_name: "Player",
            auction_status: "active",
            current_highest_bid_amount: 20,
            auction_league_id: 2,
            max_amount: 999,
            email: "private@example.com",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "user-1",
            league_id: 2,
            locked_credits: 20,
            current_budget: 480,
            stack: "internal trace",
          },
        ],
      });
    const audit = spyAuditLog();
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/debug/all-autobids/route");

    const response = await GET(
      new NextRequest("http://localhost/api/debug/all-autobids?leagueId=2"),
    );

    expect(await response.json()).toEqual({
      status: "success",
      data: {
        leagueId: "2",
        autoBids: [
          {
            id: 7,
            auction_id: 8,
            user_id: "user-1",
            is_active: 1,
            created_at: 10,
            player_id: 11,
            player_name: "Player",
            auction_status: "active",
            current_highest_bid_amount: 20,
            auction_league_id: 2,
          },
        ],
        participants: [
          {
            user_id: "user-1",
            league_id: 2,
            locked_credits: 20,
            current_budget: 480,
          },
        ],
      },
    });
    audit.expectAudit({
      actorUserId: "admin-1",
      action: "debug.read",
      resource: "debug/all-autobids",
      outcome: "success",
    });
  });

  it("allowlists autobid-check fields and audits the read", async () => {
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    dbExecute
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "user-1",
            league_id: 2,
            locked_credits: 40,
            current_budget: 460,
            email: "private@example.com",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            auction_id: 8,
            is_active: 1,
            created_at: 10,
            player_id: 11,
            player_name: "Player",
            auction_status: "active",
            current_highest_bid_amount: 20,
            auction_league_id: 2,
            max_amount: 999,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total_auto_bid: 25 }] });
    const audit = spyAuditLog();
    const { NextRequest } = await import("next/server");
    const { GET } = await import("@/app/api/debug/autobid-check/route");

    const response = await GET(
      new NextRequest("http://localhost/api/debug/autobid-check?leagueId=2&userId=user-1"),
    );
    const payload = await response.json();

    expect(payload.data.participant).toEqual({
      user_id: "user-1",
      league_id: 2,
      locked_credits: 40,
      current_budget: 460,
    });
    expect(payload.data.autoBids).toEqual([
      {
        auction_id: 8,
        is_active: 1,
        created_at: 10,
        player_id: 11,
        player_name: "Player",
        auction_status: "active",
        current_highest_bid_amount: 20,
        auction_league_id: 2,
      },
    ]);
    audit.expectAudit({ resource: "debug/autobid-check", outcome: "success" });
  });

  it("allowlists budget-verification fields and audits the read", async () => {
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    dbExecute
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1", disponibili: 400, email: "x@y.z" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1", amount: 10, stack: "trace" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1", num_players: 1, max_amount: 99 }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1", active_auctions: 1, email: "x@y.z" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-1", num_penalties: 0, stack: "trace" }] });
    const audit = spyAuditLog();
    const { GET } = await import("@/app/api/debug/budget-verification/route");

    const response = await GET(
      new Request("http://localhost/api/debug/budget-verification?leagueId=2"),
    );
    const payload = await response.json();

    expect(payload.data.participants).toEqual([
      {
        user_id: "user-1",
        manager_team_name: null,
        disponibili: 400,
        bloccati: null,
        iniziale: null,
        spesi_calcolati: null,
      },
    ]);
    expect(payload.data.transactions).toEqual([
      {
        user_id: "user-1",
        transaction_type: null,
        amount: 10,
        description: null,
        created_at: null,
        balance_after_in_league: null,
      },
    ]);
    expect(payload.data.assignments).toEqual([
      { user_id: "user-1", num_players: 1, total_spent: null },
    ]);
    expect(payload.data.activeAuctions).toEqual([
      { user_id: "user-1", active_auctions: 1, locked_amount: null },
    ]);
    expect(payload.data.penalties).toEqual([
      { user_id: "user-1", num_penalties: 0, total_penalties: null },
    ]);
    audit.expectAudit({ resource: "debug/budget-verification", outcome: "success" });
  });

  it("rejects GET and requires an admin for the compliance task POST", async () => {
    currentUser.mockResolvedValue({ id: "manager-1", publicMetadata: { role: "manager" } });
    const { GET, POST } = await import(
      "@/app/api/admin/tasks/schedule-compliance-timers/route"
    );

    expect((await GET()).status).toBe(405);
    expect((await POST()).status).toBe(403);
    expect(processExpiredComplianceTimers).not.toHaveBeenCalled();
  });

  it("audits a successful timer task mutation", async () => {
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    processExpiredComplianceTimers.mockResolvedValue({ processedCount: 1, errors: [] });
    const audit = spyAuditLog();
    const { POST } = await import(
      "@/app/api/admin/tasks/schedule-compliance-timers/route"
    );

    expect((await POST()).status).toBe(200);
    audit.expectAudit({
      actorUserId: "admin-1",
      action: "admin-task.run",
      resource: "SCHEDULE_COMPLIANCE_TIMERS",
      outcome: "success",
    });
  });

  it("blocks anonymous access to both timer processor aliases", async () => {
    currentUser.mockResolvedValue(null);
    const complianceRoute = await import(
      "@/app/api/admin/tasks/process-compliance-timers/route"
    );
    const responseRoute = await import(
      "@/app/api/admin/tasks/process-response-timers/route"
    );

    expect((await complianceRoute.POST()).status).toBe(401);
    expect((await responseRoute.POST()).status).toBe(401);
    expect(processExpiredComplianceTimers).not.toHaveBeenCalled();
    expect(processExpiredResponseTimers).not.toHaveBeenCalled();
  });

  it.each(callers)(
    "enforces the $label matrix on manual auction processing",
    async ({ user, expectedStatus }) => {
      currentUser.mockResolvedValue(user);
      processExpiredAuctionsAndAssignPlayers.mockResolvedValue({
        processedCount: 0,
        failedCount: 0,
        errors: [],
      });
      const { POST } = await import("@/app/api/admin/tasks/process-auctions/route");

      expect((await POST()).status).toBe(expectedStatus);
      expect(processExpiredAuctionsAndAssignPlayers).toHaveBeenCalledTimes(
        expectedStatus === 200 ? 1 : 0,
      );
    },
  );

  it("returns 405 for GET and audits successful manual auction processing", async () => {
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    processExpiredAuctionsAndAssignPlayers.mockResolvedValue({
      processedCount: 1,
      failedCount: 0,
      errors: [],
    });
    const audit = spyAuditLog();
    const { GET, POST } = await import("@/app/api/admin/tasks/process-auctions/route");

    expect((await GET()).status).toBe(405);
    expect((await POST()).status).toBe(200);
    audit.expectAudit({
      actorUserId: "admin-1",
      action: "admin-task.run",
      resource: "process-auctions",
      outcome: "success",
    });
  });
});
