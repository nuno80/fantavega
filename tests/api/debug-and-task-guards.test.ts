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
  });

  it("blocks anonymous access before the Addai debug query", async () => {
    currentUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/debug/addai/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(dbExecute).not.toHaveBeenCalled();
  });

  it("returns not found for debug APIs disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEBUG_API", "false");
    currentUser.mockResolvedValue({ id: "admin-1", publicMetadata: { role: "admin" } });
    const { GET } = await import("@/app/api/debug/addai/route");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(dbExecute).not.toHaveBeenCalled();
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

  it("blocks non-admin access to manual auction processing", async () => {
    currentUser.mockResolvedValue({ id: "manager-1", publicMetadata: { role: "manager" } });
    const { POST } = await import("@/app/api/admin/tasks/process-auctions/route");

    expect((await POST()).status).toBe(403);
    expect(processExpiredAuctionsAndAssignPlayers).not.toHaveBeenCalled();
  });
});
