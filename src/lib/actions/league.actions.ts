// src/lib/actions/league.actions.ts v.1.1
// Correzione: Aggiunto 'await' alla chiamata auth() di Clerk.

// 1. Direttiva per indicare che questo è un file di Server Actions
"use server";

// 2. Importazioni necessarie
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
// 6. Importazione aggiuntiva per la nuova action
import { addParticipantToLeague as addParticipantService } from "@/lib/db/services/auction-league.service";
import { CreateLeagueSchema } from "@/lib/validators/league.validators";

// src/lib/actions/league.actions.ts v.1.1
// Correzione: Aggiunto 'await' alla chiamata auth() di Clerk.

// 1. Direttiva per indicare che questo è un file di Server Actions

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

// 7. Definizione del tipo di ritorno per la nuova action
export type AddParticipantFormState = {
  success: boolean;
  message: string;
};

// 8. Server Action per aggiungere un partecipante
export async function addParticipantAction(
  prevState: AddParticipantFormState,
  formData: FormData
): Promise<AddParticipantFormState> {
  // 8.1. Autenticazione e Autorizzazione
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return {
      success: false,
      message: "Azione non autorizzata: utente non autenticato.",
    };
  }

  // 8.2. Estrazione e validazione dei dati dal form
  const leagueId = Number(formData.get("leagueId"));
  const userIdToAdd = formData.get("userIdToAdd") as string;
  const teamName = formData.get("teamName") as string;

  if (!leagueId || !userIdToAdd || !teamName) {
    return {
      success: false,
      message: "Dati mancanti. Tutti i campi sono obbligatori.",
    };
  }

  if (teamName.length < 3) {
    return {
      success: false,
      message: "Il nome della squadra deve essere di almeno 3 caratteri.",
    };
  }

  // 8.3. Chiamata alla funzione di servizio
  try {
    const result = await addParticipantService(
      leagueId,
      adminUserId,
      userIdToAdd,
      teamName
    );

    if (!result.success) {
      return { success: false, message: result.message };
    }

    // 8.4. Revalidazione del path per aggiornare la UI
    // Questo farà sì che la lista dei partecipanti nella dashboard si aggiorni automaticamente.
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);

    return { success: true, message: "Partecipante aggiunto con successo!" };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Errore sconosciuto durante l'aggiunta del partecipante.";
    console.error("Errore nella Server Action addParticipantAction:", error);
    return { success: false, message: errorMessage };
  }
}
