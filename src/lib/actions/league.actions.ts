// src/lib/actions/league.actions.ts v.1.1
// Correzione: Aggiunto 'await' alla chiamata auth() di Clerk.

// 1. Direttiva per indicare che questo è un file di Server Actions
"use server";

// 2. Importazioni necessarie
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import { CreateLeagueSchema } from "@/lib/validators/league.validators";

// src/lib/actions/league.actions.ts v.1.1
// Correzione: Aggiunto 'await' alla chiamata auth() di Clerk.

// 1. Direttiva per indicare che questo è un file di Server Actions

// 3. Definizione del tipo di ritorno della action
export type FormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  newLeagueId?: number;
};

// 4. Server Action per creare una lega
export async function createLeague(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  // 4.1. Autenticazione e Autorizzazione
  // CORREZIONE: Aggiunto await per risolvere la Promise di auth()
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Utente non autenticato." };
  }
  // In un'app reale, qui verificheremmo anche se l'utente ha il ruolo 'admin'

  // 4.2. Conversione FormData in un oggetto semplice
  const data = Object.fromEntries(formData.entries());

  // 4.3. Validazione dei dati con lo schema Zod
  const validated = CreateLeagueSchema.safeParse(data);

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors;
    return {
      success: false,
      message: "Errore di validazione. Controlla i campi.",
      errors: fieldErrors,
    };
  }

  let newLeagueId: number;

  // 4.4. Logica di business: interazione con il database
  try {
    const {
      name,
      league_type,
      initial_budget_per_manager,
      slots_P,
      slots_D,
      slots_C,
      slots_A,
      timer_duration_minutes,
      min_bid_rule,
      min_bid,
    } = validated.data;
    const config_json = JSON.stringify({ min_bid_rule: min_bid_rule });

    const transaction = db.transaction(() => {
      const leagueStmt = db.prepare(
        `INSERT INTO auction_leagues (
            name, league_type, initial_budget_per_manager, admin_creator_id,
            slots_P, slots_D, slots_C, slots_A,
            timer_duration_minutes, min_bid, config_json,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const leagueResult = leagueStmt.run(
        name,
        league_type,
        initial_budget_per_manager,
        userId,
        slots_P,
        slots_D,
        slots_C,
        slots_A,
        timer_duration_minutes,
        min_bid_rule === "fixed" ? min_bid : 1,
        config_json,
        "participants_joining"
      );
      const id = leagueResult.lastInsertRowid as number;

      const participantStmt = db.prepare(
        `INSERT INTO league_participants (league_id, user_id, current_budget) VALUES (?, ?, ?)`
      );
      participantStmt.run(id, userId, initial_budget_per_manager);

      const transactionStmt = db.prepare(
        `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, description) VALUES (?, ?, ?, ?, ?, ?)`
      );
      transactionStmt.run(
        id,
        userId,
        "initial_allocation",
        initial_budget_per_manager,
        initial_budget_per_manager,
        "Allocazione budget iniziale"
      );

      return id;
    });

    newLeagueId = transaction();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return {
        success: false,
        message: "Errore del database: Esiste già una lega con questo nome.",
        errors: { name: ["Questo nome è già in uso."] },
      };
    }
    console.error("Errore creazione lega:", error);
    return {
      success: false,
      message:
        "Si è verificato un errore imprevisto durante la creazione della lega.",
    };
  }

  // 5. Post-creazione: Revalidazione e Redirect
  revalidatePath("/admin/leagues");
  redirect(`/admin/leagues/${newLeagueId}/dashboard`);
}
