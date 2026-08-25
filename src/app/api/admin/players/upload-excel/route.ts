import { NextResponse } from "next/server";

import { currentUser } from "@clerk/nextjs/server";

import {
  type PlayerImportResult,
  processPlayersExcel,
} from "@/lib/db/services/player-import.service";
import {
  validateExcelRequestLength,
  validateExcelUpload,
} from "@/lib/import/excel-upload-policy";

interface UploadFileLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isUploadFileLike(value: unknown): value is UploadFileLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UploadFileLike>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    Number.isSafeInteger(candidate.size) &&
    candidate.size >= 0 &&
    typeof candidate.arrayBuffer === "function"
  );
}

function auditUpload(
  actorUserId: string,
  uploadStartedAt: number,
  details: Record<string, unknown>
): void {
  console.info("[AUDIT PLAYER_UPLOAD]", {
    actorUserId,
    durationMs: Math.round(performance.now() - uploadStartedAt),
    ...details,
  });
}

export async function POST(request: Request) {
  console.log(
    "[API PLAYER_UPLOAD POST] Received request to upload players Excel."
  );

  let auditContext:
    | { actorUserId: string; uploadStartedAt: number; sizeBytes: number | null }
    | undefined;
  try {
    const user = await currentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.publicMetadata?.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to perform this action.",
        },
        { status: 403 }
      );
    }

    const uploadStartedAt = performance.now();
    const contentLength = request.headers?.get("content-length") ?? null;
    const declaredBytes =
      contentLength !== null && /^\d+$/.test(contentLength)
        ? Number(contentLength)
        : null;
    auditContext = {
      actorUserId: user.id,
      uploadStartedAt,
      sizeBytes:
        declaredBytes !== null && Number.isSafeInteger(declaredBytes)
          ? declaredBytes
          : null,
    };

    const requestLengthError = validateExcelRequestLength(contentLength);
    if (requestLengthError) {
      auditUpload(user.id, uploadStartedAt, {
        sizeBytes: auditContext.sizeBytes,
        status: "rejected",
        reason: "REQUEST_SIZE",
      });
      return NextResponse.json(
        { error: requestLengthError.error },
        { status: requestLengthError.status }
      );
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    const replaceMode = formData.get("replaceMode") === "true";

    if (fileValue === null) {
      auditUpload(user.id, uploadStartedAt, {
        sizeBytes: auditContext.sizeBytes,
        status: "rejected",
        reason: "MISSING_FILE",
      });
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!isUploadFileLike(fileValue)) {
      auditUpload(user.id, uploadStartedAt, {
        sizeBytes: auditContext.sizeBytes,
        status: "rejected",
        reason: "INVALID_FILE_FIELD",
      });
      return NextResponse.json(
        { error: "The file field must contain a valid upload." },
        { status: 400 }
      );
    }

    auditContext.sizeBytes = fileValue.size;
    const uploadError = validateExcelUpload(fileValue);
    if (uploadError) {
      auditUpload(user.id, uploadStartedAt, {
        sizeBytes: fileValue.size,
        status: "rejected",
        reason: uploadError.status === 413 ? "FILE_SIZE" : "FILE_TYPE",
      });
      return NextResponse.json(
        { error: uploadError.error },
        { status: uploadError.status }
      );
    }

    const fileBuffer = Buffer.from(await fileValue.arrayBuffer());
    const importResult: PlayerImportResult = await processPlayersExcel(
      fileBuffer,
      { replaceMode }
    );

    auditUpload(user.id, uploadStartedAt, {
      sizeBytes: fileValue.size,
      status: importResult.success ? "accepted" : "rejected",
      reason: importResult.success ? "IMPORTED" : "IMPORT_REJECTED",
      replaceMode,
      processedRows: importResult.processedRows,
    });

    if (importResult.success) {
      return NextResponse.json(
        {
          message: importResult.message,
          totalRowsInSheet: importResult.totalRowsInSheet,
          parsedDataRows: importResult.processedRows,
          successfullyUpserted: importResult.successfullyUpsertedRows,
          deletedOrphans: importResult.deletedOrphanPlayers,
          validationFailures: importResult.failedValidationRows,
          dbOperationFailures: importResult.failedDbOperationsRows,
          errors: importResult.errors,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: importResult.message,
        totalRowsInSheet: importResult.totalRowsInSheet,
        parsedDataRows: importResult.processedRows,
        successfullyUpserted: importResult.successfullyUpsertedRows,
        validationFailures: importResult.failedValidationRows,
        dbOperationFailures: importResult.failedDbOperationsRows,
        errors: importResult.errors.slice(0, 10),
        hasMoreErrors: importResult.errors.length > 10,
      },
      { status: 400 }
    );
  } catch (error) {
    if (auditContext) {
      auditUpload(auditContext.actorUserId, auditContext.uploadStartedAt, {
        sizeBytes: auditContext.sizeBytes,
        status: "rejected",
        reason: "INVALID_REQUEST",
      });
    }
    console.error("[API PLAYER_UPLOAD POST] Critical error", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const errorMessage = error instanceof Error ? error.message : "";
    if (
      errorMessage.includes("could not parse content-type") ||
      (error instanceof TypeError && error.message.includes("Failed to parse"))
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request format or corrupted file. Expected multipart/form-data with a valid Excel file.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          "An unexpected server error occurred during file upload and processing.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
