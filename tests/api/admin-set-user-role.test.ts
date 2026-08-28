import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser, clerkClient, getUser, updateUser } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser, clerkClient }));

describe("POST /api/admin/set-user-role", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser.mockReset();
    clerkClient.mockReset();
    getUser.mockReset();
    updateUser.mockReset();

    currentUser.mockResolvedValue({
      id: "admin-1",
      publicMetadata: { role: "admin" },
    });
    getUser.mockResolvedValue({ publicMetadata: { role: "user", teamName: "Rossi FC" } });
    clerkClient.mockResolvedValue({ users: { getUser, updateUser } });
    updateUser.mockImplementation(async (_id, { publicMetadata }) => ({
      id: "user-2",
      publicMetadata,
    }));
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
      publicMetadata: { role: "manager", teamName: "Rossi FC" },
    });
  });

  it("preserves unrelated publicMetadata when clearing a role", async () => {
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-2", role: null }),
      }),
    );

    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith("user-2", {
      publicMetadata: { role: null, teamName: "Rossi FC" },
    });
  });

  it("rejects non-admin callers", async () => {
    currentUser.mockResolvedValue({ id: "user-2", publicMetadata: { role: "manager" } });
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-3", role: "admin" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("rejects anonymous callers", async () => {
    currentUser.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-3", role: "admin" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(clerkClient).not.toHaveBeenCalled();
  });

  it("returns 500 with sanitized body when Clerk fails on an unknown user", async () => {
    getUser.mockRejectedValue(new Error("Not Found - user_2abc does not exist"));
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "user-missing", role: "manager" }),
      }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("user_2abc");
    expect(updateUser).not.toHaveBeenCalled();
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

  it("blocks self-role changes", async () => {
    const { POST } = await import("@/app/api/admin/set-user-role/route");
    const response = await POST(
      new Request("https://app.test/api/admin/set-user-role", {
        method: "POST",
        body: JSON.stringify({ userId: "admin-1", role: "manager" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(clerkClient).not.toHaveBeenCalled();
  });
});
