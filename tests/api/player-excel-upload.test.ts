import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/players/upload-excel/route";
import {
  MAX_EXCEL_MULTIPART_BYTES,
  MAX_EXCEL_UPLOAD_BYTES,
} from "@/lib/import/excel-upload-policy";

const { currentUser, processPlayersExcel } = vi.hoisted(() => ({
  currentUser: vi.fn(),
  processPlayersExcel: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ currentUser }));
vi.mock("@/lib/db/services/player-import.service", () => ({
  processPlayersExcel,
}));

function requestWithFile(file: unknown, contentLength?: number): Request {
  const formData = {
    get: vi.fn((key: string) => (key === "file" ? file : null)),
  };
  return {
    headers: new Headers({
      "content-length": String(
        contentLength ?? (file as { size?: number }).size ?? 512
      ),
    }),
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request;
}

describe("POST /api/admin/players/upload-excel", () => {
  beforeEach(() => {
    currentUser.mockReset();
    processPlayersExcel.mockReset();
    currentUser.mockResolvedValue({
      id: "admin-1",
      publicMetadata: { role: "admin" },
    });
  });

  it("rejects an oversized multipart request before reading form data", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        "content-length": String(MAX_EXCEL_MULTIPART_BYTES + 1),
      }),
      formData,
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(processPlayersExcel).not.toHaveBeenCalled();
  });

  it("rejects a false MIME type before buffering the file", async () => {
    const arrayBuffer = vi.fn();
    const file = {
      name: "players.xlsx",
      type: "text/plain",
      size: 9,
      arrayBuffer,
    } as unknown as File;

    const response = await POST(requestWithFile(file));

    expect(response.status).toBe(415);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(processPlayersExcel).not.toHaveBeenCalled();
  });

  it("rejects a valid MIME with the wrong extension before buffering", async () => {
    const arrayBuffer = vi.fn();
    const response = await POST(
      requestWithFile({
        name: "players.txt",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 12,
        arrayBuffer,
      })
    );

    expect(response.status).toBe(415);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MiB before arrayBuffer", async () => {
    const arrayBuffer = vi.fn();
    const response = await POST(
      requestWithFile(
        {
          name: "players.xlsx",
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: MAX_EXCEL_UPLOAD_BYTES + 1,
          arrayBuffer,
        },
        MAX_EXCEL_UPLOAD_BYTES + 512
      )
    );

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects a non File-like multipart field with 400", async () => {
    const response = await POST(requestWithFile("not-a-file", 512));

    expect(response.status).toBe(400);
    expect(processPlayersExcel).not.toHaveBeenCalled();
  });

  it("records bounded size/duration metrics for post-auth rejections", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const file = {
      name: "private-name.xlsx",
      type: "text/plain",
      size: 9,
      arrayBuffer: vi.fn(),
    };

    const response = await POST(requestWithFile(file));

    expect(response.status).toBe(415);
    expect(audit).toHaveBeenCalledWith(
      "[AUDIT PLAYER_UPLOAD]",
      expect.objectContaining({
        actorUserId: "admin-1",
        sizeBytes: 9,
        durationMs: expect.any(Number),
        status: "rejected",
        reason: "FILE_TYPE",
      })
    );
    expect(JSON.stringify(audit.mock.calls)).not.toContain("private-name.xlsx");
    audit.mockRestore();
  });
});
