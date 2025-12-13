// src/app/api/admin/set-user-role/route.ts
import { NextResponse } from "next/server";

import { auth, clerkClient } from "@clerk/nextjs/server";

type AppRole = "admin" | "manager";

export async function POST(request: Request) {
  const { userId: currentUserId, sessionClaims } = await auth();

  // 1. Verifica se l'utente corrente è loggato
  if (!currentUserId) {
    return NextResponse.json(
      { error: "Non autorizzato: Login richiesto." },
      { status: 401 }
    );
  }

  // 2. Verifica ruolo admin con fallback multipli (allineato con middleware)
  let isAdmin = false;
  let roleSource = "none";

  // Tentativo 1: sessionClaims.metadata.role
  if (sessionClaims?.metadata?.role === "admin") {
    isAdmin = true;
    roleSource = "sessionClaims.metadata.role";
  }
  // Tentativo 2: sessionClaims.publicMetadata.role (camelCase)
  else if (sessionClaims?.publicMetadata?.role === "admin") {
    isAdmin = true;
    roleSource = "sessionClaims.publicMetadata.role";
  }
  // Tentativo 3: sessionClaims['public_metadata'].role (snake_case)
  else {
    const snakeCasePublicMeta = sessionClaims?.["public_metadata"] as
      | { role?: AppRole }
      | undefined;
    if (snakeCasePublicMeta?.role === "admin") {
      isAdmin = true;
      roleSource = "sessionClaims['public_metadata'].role";
    }
  }

  // Tentativo 4: Fallback a clerkClient API
  if (!isAdmin) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(currentUserId);
      const clerkRole = user.publicMetadata?.role as AppRole | undefined;
      if (clerkRole === "admin") {
        isAdmin = true;
        roleSource = "clerkClient API fallback";
      }
    } catch (error) {
      console.error("[set-user-role] Error fetching user from Clerk API:", error);
    }
  }

  console.log(`[set-user-role] Role verification for ${currentUserId}: isAdmin=${isAdmin}, source=${roleSource}`);

  if (!isAdmin) {
    console.warn(
      `Accesso API negato per set-user-role per l'utente ${currentUserId}. Role source: ${roleSource}`
    );
    return NextResponse.json(
      { error: "Accesso negato: Privilegi insufficienti." },
      { status: 403 }
    );
  }

  // 3. Estrai userId (dell'utente da modificare) e role dal corpo della richiesta
  let userIdToUpdate: string;
  let roleToSet: string | null; // Permetti null per "rimuovere" il ruolo

  try {
    const body = await request.json();
    userIdToUpdate = body.userId;
    roleToSet = body.role === "" ? null : body.role; // Se il ruolo è stringa vuota, interpretalo come null

    if (!userIdToUpdate) {
      return NextResponse.json(
        { error: "userId mancante nel corpo della richiesta." },
        { status: 400 }
      );
    }
    // Non è necessario controllare 'roleToSet' qui, perché null è un valore valido per rimuovere il ruolo.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json(
      { error: "Corpo della richiesta non valido o malformato." },
      { status: 400 }
    );
  }

  // Impedisci a un admin di modificare il proprio ruolo tramite questa API specifica
  // o di modificare il ruolo di un altro super-admin (se avessi tale concetto)
  if (userIdToUpdate === currentUserId) {
    return NextResponse.json(
      {
        error:
          "Gli amministratori non possono modificare il proprio ruolo tramite questa interfaccia.",
      },
      { status: 403 }
    );
  }

  try {
    console.log(
      `Admin ${currentUserId} sta tentando di impostare il ruolo a '${roleToSet ?? "nessuno"}' per l'utente ${userIdToUpdate}`
    );

    // Ignora l'errore di tipo per clerkClient.users
    // @ts-expect-error TS#2339: TypeScript infers clerkClient as a function, but we expect an object with a 'users' property.
    const updatedUser = await clerkClient.users.updateUser(userIdToUpdate, {
      publicMetadata: {
        role: roleToSet, // Imposta il ruolo, o null per rimuoverlo
      },
    });

    console.log(
      `Ruolo aggiornato per l'utente ${userIdToUpdate}. Nuovo ruolo: ${updatedUser.publicMetadata?.role ?? "nessuno"}`
    );
    return NextResponse.json({
      success: true,
      user: { id: updatedUser.id, role: updatedUser.publicMetadata?.role },
    });
  } catch (error: unknown) {
    console.error(
      `Errore API nell'aggiornare il ruolo per l'utente ${userIdToUpdate}:`,
      error
    );
    let errorMessage =
      "Errore interno del server durante l'aggiornamento del ruolo.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // Log più dettagliato dell'errore
    if (typeof error === "object" && error !== null && "message" in error) {
      console.error(
        "Dettagli errore:",
        (error as { message: string }).message,
        error
      );
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
