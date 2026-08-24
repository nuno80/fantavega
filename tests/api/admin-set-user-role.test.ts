import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, clerkClient, updateUser } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser, clerkClient }));

describe("POST /api/admin/set-user-role", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    clerkClient.mockReset();
    updateUser.mockReset();

    currentUser.mockResolvedValue({
      id: "admin-1",
      publicMetadata: { role: "admin" },
    });
    clerkClient.mockResolvedValue({ users: { updateUser } });
    updateUser.mockResolvedValue({ id: "user-2", publicMetadata: { role: "manager" } });
  });

  it("uses the asynchronous Clerk client to update a valid role", async () => {
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "manager" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(clerkClient).toHaveBeenCalledOnce();
    expect(updateUser).toHaveBeenCalledWith("user-2", {
      publicMetadata: { role: "manager" },
    });
  });

  it("rejects roles outside the application role contract", async () => {
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: "super-admin" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
