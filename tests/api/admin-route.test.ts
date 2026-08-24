import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));

describe("admin route authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
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

});
