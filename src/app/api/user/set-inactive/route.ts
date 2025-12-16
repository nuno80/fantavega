// src/app/api/user/set-inactive/route.ts
// Endpoint per chiudere la sessione utente quando diventa inattivo
// Questo permette ai timer di risposta di rimanere pendenti fino al ritorno dell'utente
import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import { recordUserLogout } from "@/lib/db/services/session.service";

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Chiudi la sessione attiva dell'utente
    await recordUserLogout(userId);

    console.log(`[SET_INACTIVE] User ${userId} marked as inactive`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SET_INACTIVE] Error:", error);
    // Non fallire silenziosamente, ma non bloccare il redirect
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// Supporta anche beacon API (che usa POST senza body parsing)
export const dynamic = "force-dynamic";
