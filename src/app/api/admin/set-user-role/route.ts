import { NextResponse } from "next/server";

import { clerkClient } from "@clerk/nextjs/server";

import { authorizeAdminRequest } from "@/lib/auth/admin-route";
import { errorResponse } from "@/lib/errors";

type AppRole = "admin" | "manager";

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager";
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest();
  if (!authorization.authorized) {
    return NextResponse.json(
      {
        error:
          authorization.status === 401
            ? "Non autorizzato: Login richiesto."
            : "Accesso negato: Privilegi insufficienti.",
      },
      { status: authorization.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo della richiesta non valido o malformato." },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null || !("userId" in body) || !("role" in body)) {
    return NextResponse.json({ error: "userId e role sono obbligatori." }, { status: 400 });
  }

  const { userId, role } = body as { userId?: unknown; role?: unknown };
  if (typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ error: "userId non valido." }, { status: 400 });
  }
  if (!(role === "" || role === null || isAppRole(role))) {
    return NextResponse.json({ error: "Ruolo non valido." }, { status: 400 });
  }

  const roleToSet: AppRole | null = role === "" || role === null ? null : role;
  if (userId === authorization.userId) {
    return NextResponse.json(
      { error: "Gli amministratori non possono modificare il proprio ruolo tramite questa interfaccia." },
      { status: 403 },
    );
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    // Merge: non sovrascrivere metadata non correlati già presenti.
    const updatedUser = await client.users.updateUser(userId, {
      publicMetadata: { ...user.publicMetadata, role: roleToSet },
    });

    return NextResponse.json({
      success: true,
      user: { id: updatedUser.id, role: updatedUser.publicMetadata?.role },
    });
  } catch (error) {
    return errorResponse(error, "set-user-role", { userId });
  }
}
