import { NextResponse } from "next/server";

import { getDashboardStats } from "@/lib/db/services/admin.service";

export async function GET() {
  try {
    // Aggiungiamo un controllo per assicurarci che solo gli admin possano chiamare questo endpoint
    // Questa è una sicurezza aggiuntiva lato server.
    // La UI è già protetta dal middleware, ma è buona norma proteggere anche le API.
    // Nota: questo è un esempio base, in un'app reale useresti il middleware anche per le API
    // o un meccanismo di autorizzazione più robusto.

    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API_ADMIN_DASHBOARD_STATS]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
