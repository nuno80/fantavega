import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, getDashboardStats } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  getDashboardStats: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db/services/admin.service", () => ({ getDashboardStats }));

describe("admin route authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    getDashboardStats.mockReset();
  });

  it("distinguishes anonymous, non-admin and admin callers", async () => {
    const { authorizeAdminRequest } = await import("@/lib/auth/admin-route");

    currentUser.mockResolvedValueOnce(null);
    await expect(authorizeAdminRequest()).resolves.toEqual({ authorized: false, status: 401 });

    currentUser.mockResolvedValueOnce({ id: "user-1", publicMetadata: { role: "manager" } });
    await expect(authorizeAdminRequest()).resolves.toEqual({ authorized: false, status: 403 });

    currentUser.mockResolvedValueOnce({ id: "admin-1", publicMetadata: { role: "admin" } });
    await expect(authorizeAdminRequest()).resolves.toEqual({ authorized: true, userId: "admin-1" });
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
    "enforces the $label matrix on direct dashboard statistics access",
    async ({ user, expectedStatus }) => {
      currentUser.mockResolvedValue(user);
      getDashboardStats.mockResolvedValue({});
      const { GET } = await import("@/app/api/admin/dashboard-stats/route");

      const response = await GET();

      expect(response.status).toBe(expectedStatus);
      expect(getDashboardStats).toHaveBeenCalledTimes(expectedStatus === 200 ? 1 : 0);
    },
  );

  it.each(callers)(
    "enforces the $label matrix on direct league detail access",
    async ({ user, expectedStatus }) => {
      currentUser.mockResolvedValue(user);
      const { GET, POST } = await import("@/app/api/admin/leagues/[league-id]/route");
      const context = { params: Promise.resolve({ "league-id": "league-1" }) };

      expect((await GET(new Request("http://localhost"), context)).status).toBe(expectedStatus);
      expect((await POST(new Request("http://localhost"), context)).status).toBe(expectedStatus);
    },
  );

});
