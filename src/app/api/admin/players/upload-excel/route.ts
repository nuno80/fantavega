// src/app/api/admin/players/upload-excel/route.ts v.1.1
// API Route per l'upload di file Excel contenenti dati dei giocatori da parte dell'admin.
// 1. Importazioni
import { NextResponse } from "next/server";

// Assicurati che questo percorso sia corretto
import { currentUser } from "@clerk/nextjs/server";

import {
  PlayerImportResult,
  processPlayersExcel,
} from "@/lib/db/services/player-import.service";

// 2. Funzione POST per Gestire l'Upload del File
export async function POST(request: Request) {
  console.log(
    "[API PLAYER_UPLOAD POST] Received request to upload players Excel."
  );

  try {
    // 2.1. Autenticazione e Autorizzazione Admin
    const user = await currentUser();
    if (!user || !user.id) {
      console.warn(
        "[API PLAYER_UPLOAD POST] Unauthorized: No user session found."
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = user.publicMetadata?.role === "admin";
    if (!isAdmin) {
      console.warn(
        `[API PLAYER_UPLOAD POST] Forbidden: User ${user.id} is not an admin.`
      );
      return NextResponse.json(
        {
          error:
            "Forbidden: You do not have permission to perform this action.",
        },
        { status: 403 }
      );
    }
    console.log(`[API PLAYER_UPLOAD POST] Admin user ${user.id} authorized.`);

    // 2.2. Gestione del File Upload (multipart/form-data)
    const formData = await request.formData();
    const file = formData.get("file") as File | null; // "file" è il nome del campo atteso

    if (!file) {
      console.warn("[API PLAYER_UPLOAD POST] No file provided in the request.");
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Validazione base del tipo di file (meno stringente, affidandosi al parser)
    const allowedMimeTypesForLogging = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/CDFV2", // Office Compound Document File V2 (a volte per .xls)
    ];
    if (!allowedMimeTypesForLogging.includes(file.type)) {
      console.warn(
        `[API PLAYER_UPLOAD POST] Received file with potentially unexpected MIME type: ${file.type}. File: ${file.name}. Attempting to parse anyway.`
      );
    } else {
      console.log(
        `[API PLAYER_UPLOAD POST] Received file with MIME type: ${file.type}.`
      );
    }

    console.log(
      `[API PLAYER_UPLOAD POST] File "${file.name}" received, size: ${file.size} bytes.`
    );

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 2.3. Chiamata al Servizio di Importazione
    console.log("[API PLAYER_UPLOAD POST] Calling player import service...");
    const importResult: PlayerImportResult =
      await processPlayersExcel(fileBuffer);

    // 2.4. Gestione della Risposta del Servizio
    if (importResult.success) {
      console.log(
        "[API PLAYER_UPLOAD POST] Player import successful.",
        importResult
      );
      return NextResponse.json(
        {
          message: importResult.message,
          totalRowsInSheet: importResult.totalRowsInSheet,
          parsedDataRows: importResult.processedRows,
          successfullyUpserted: importResult.successfullyUpsertedRows,
          // Se success è true, failedValidationRows e failedDbOperationsRows dovrebbero essere 0
          // e errors dovrebbe essere vuoto. Li includiamo per completezza se necessario,
          // ma potrebbero essere omessi dalla risposta di successo.
          // Per ora li lascio per debug, ma potresti volerli rimuovere dalla risposta 200.
          validationFailures: importResult.failedValidationRows,
          dbOperationFailures: importResult.failedDbOperationsRows,
          errors: importResult.errors,
        },
        { status: 200 }
      );
    } else {
      console.warn(
        "[API PLAYER_UPLOAD POST] Player import failed.",
        importResult
      );
      const limitedErrors = importResult.errors.slice(0, 10);
      return NextResponse.json(
        {
          message: importResult.message,
          totalRowsInSheet: importResult.totalRowsInSheet,
          parsedDataRows: importResult.processedRows,
          successfullyUpserted: importResult.successfullyUpsertedRows,
          validationFailures: importResult.failedValidationRows,
          dbOperationFailures: importResult.failedDbOperationsRows,
          errors: limitedErrors,
          hasMoreErrors: importResult.errors.length > 10,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    // 2.5. Gestione Errori Generali
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during file upload.";
    console.error(
      `[API PLAYER_UPLOAD POST] Critical error: ${errorMessage}`,
      error
    );

    if (
      errorMessage.includes("could not parse content-type") ||
      (error instanceof TypeError && error.message.includes("Failed to parse"))
    ) {
      // Questo errore può verificarsi se il corpo non è multipart/form-data o il file è corrotto
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

// 3. Configurazione della Route
export const dynamic = "force-dynamic";
