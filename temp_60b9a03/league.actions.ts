// src/lib/actions/league.actions.ts v.1.8 (Definitivo)
// Corretto il tipo nel blocco catch di removeParticipantAction.

"use server";

// 1. Importazioni consolidate
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import {
  addParticipantToLeague,
  removeParticipantFromLeague,
  updateLeagueStatus,
  updateParticipantTeamName,
} from "@/lib/db/services/auction-league.service";
import { CreateLeagueSchema } from "@/lib/validators/league.validators";

// src/lib/actions/league.actions.ts v.1.8 (Definitivo)
// Corretto il tipo nel blocco catch di removeParticipantAction.

// src/lib/actions/league.actions.ts v.1.8 (Definitivo)
// Corretto il tipo nel blocco catch di removeParticipantAction.

// 2. Action: Creare una Lega
export type CreateLeagueFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
};
export async function createLeague(
  prevState: CreateLeagueFormState,
  formData: FormData
): Promise<CreateLeagueFormState> {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, message: "Utente non autenticato." };
  }
  const data = Object.fromEntries(formData.entries());
  const validated = CreateLeagueSchema.safeParse(data);
  if (!validated.success) {
    return {
      success: false,
      message: "Errore di validazione.",
      errors: validated.error.flatten().fieldErrors,
    };
  }
  let newLeagueId: number;
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
        `INSERT INTO auction_leagues (name, league_type, initial_budget_per_manager, admin_creator_id, slots_P, slots_D, slots_C, slots_A, timer_duration_minutes, min_bid, config_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      // Rimosso: L'admin non viene più aggiunto automaticamente come partecipante
      // Potrà essere aggiunto manualmente dalla dashboard se necessario
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
        message: "Errore: Esiste già una lega con questo nome.",
        errors: { name: ["Questo nome è già in uso."] },
      };
    }
    return {
      success: false,
      message: "Errore imprevisto durante la creazione.",
    };
  }
  revalidatePath("/admin/leagues");
  redirect(`/admin/leagues/${newLeagueId}/dashboard`);
}

// 3. Action: Aggiungere un Partecipante
export type AddParticipantFormState = { success: boolean; message: string };
export async function addParticipantAction(
  prevState: AddParticipantFormState,
  formData: FormData
): Promise<AddParticipantFormState> {
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }
  const leagueId = Number(formData.get("leagueId"));
  const userIdToAdd = formData.get("userIdToAdd") as string;
  const teamName = formData.get("teamName") as string;
  if (!leagueId || !userIdToAdd || !teamName) {
    return { success: false, message: "Dati mancanti." };
  }
  if (teamName.length < 3) {
    return {
      success: false,
      message: "Il nome della squadra deve essere di almeno 3 caratteri.",
    };
  }
  try {
    const result = await addParticipantToLeague(
      leagueId,
      adminUserId,
      userIdToAdd,
      teamName
    );
    if (!result.success) {
      return { success: false, message: result.message || "Service error." };
    }
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);
    return { success: true, message: "Partecipante aggiunto!" };
  } catch (error) {
    let errorMessage = "Errore sconosciuto.";
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }
    return { success: false, message: errorMessage };
  }
}

// 4. Action: Aggiornare Nome Squadra
export type UpdateTeamNameFormState = { success: boolean; message: string };
export async function updateTeamNameAction(
  prevState: UpdateTeamNameFormState,
  formData: FormData
): Promise<UpdateTeamNameFormState> {
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }
  const leagueId = Number(formData.get("leagueId"));
  const participantUserId = formData.get("participantUserId") as string;
  const newTeamName = formData.get("newTeamName") as string;
  if (!leagueId || !participantUserId || !newTeamName) {
    return { success: false, message: "Dati mancanti." };
  }
  try {
    const result = await updateParticipantTeamName(
      leagueId,
      participantUserId,
      newTeamName
    );
    if (!result.success) {
      return { success: false, message: result.message || "Service error." };
    }
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);
    return { success: true, message: "Nome squadra aggiornato!" };
  } catch (error) {
    let errorMessage = "Errore sconosciuto.";
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }
    return { success: false, message: errorMessage };
  }
}

// 5. Action: Aggiornare Stato Lega
export type UpdateStatusFormState = { success: boolean; message: string };
export async function updateLeagueStatusAction(
  prevState: UpdateStatusFormState,
  formData: FormData
): Promise<UpdateStatusFormState> {
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }
  const leagueId = Number(formData.get("leagueId"));
  const newStatus = formData.get("newStatus") as string;
  if (!leagueId || !newStatus) {
    return { success: false, message: "Dati mancanti." };
  }
  try {
    const result = await updateLeagueStatus(leagueId, newStatus);
    if (!result.success) {
      return { success: false, message: result.message || "Service error." };
    }
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);
    return { success: true, message: "Stato della lega aggiornato!" };
  } catch (error) {
    let errorMessage = "Errore sconosciuto.";
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }
    return { success: false, message: errorMessage };
  }
}

// 6. Action: Rimuovere un Partecipante
export type RemoveParticipantFormState = { success: boolean; message: string };
export async function removeParticipantAction(
  prevState: RemoveParticipantFormState,
  formData: FormData
): Promise<RemoveParticipantFormState> {
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }
  const leagueId = Number(formData.get("leagueId"));
  const participantUserId = formData.get("participantUserId") as string;
  if (!leagueId || !participantUserId) {
    return { success: false, message: "Dati mancanti." };
  }
  // Rimosso il controllo che impediva all'admin di rimuovere se stesso
  // Ora l'admin può essere aggiunto/rimosso come qualsiasi altro partecipante
  try {
    const result = await removeParticipantFromLeague(
      leagueId,
      adminUserId,
      participantUserId
    );
    if (!result.success) {
      return { success: false, message: result.message || "Service error." };
    }
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);
    return { success: true, message: "Partecipante rimosso con successo!" };
  } catch (error) {
    let errorMessage = "Errore sconosciuto.";
    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    }
    return { success: false, message: errorMessage };
  }
}

// 7. Action: Eliminare una Lega
export type DeleteLeagueFormState = { success: boolean; message: string };
export async function deleteLeagueAction(
  prevState: DeleteLeagueFormState,
  formData: FormData
): Promise<DeleteLeagueFormState> {
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }

  const leagueId = Number(formData.get("leagueId"));
  const confirmationText = formData.get("confirmationText") as string;

  if (!leagueId) {
    return { success: false, message: "ID lega mancante." };
  }

  // Verifica che l'utente abbia digitato "ELIMINA" per confermare
  if (confirmationText !== "ELIMINA") {
    return { 
      success: false, 
      message: "Devi digitare 'ELIMINA' per confermare l'eliminazione." 
    };
  }

  try {
    // Verifica che l'admin sia il creatore della lega
    const leagueCheck = db.prepare(
      `SELECT admin_creator_id, name FROM auction_leagues WHERE id = ?`
    ).get(leagueId) as { admin_creator_id: string; name: string } | undefined;

    if (!leagueCheck) {
      return { success: false, message: "Lega non trovata." };
    }

    if (leagueCheck.admin_creator_id !== adminUserId) {
      return { 
        success: false, 
        message: "Solo il creatore della lega può eliminarla." 
      };
    }

    // Elimina la lega (le foreign key CASCADE elimineranno automaticamente i dati correlati)
    const deleteResult = db.prepare(
      `DELETE FROM auction_leagues WHERE id = ?`
    ).run(leagueId);

    if (deleteResult.changes === 0) {
      return { success: false, message: "Errore durante l'eliminazione." };
    }

    revalidatePath("/admin/leagues");
    return { 
      success: true, 
      message: `Lega "${leagueCheck.name}" eliminata con successo.` 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto.";
    return { success: false, message: `Errore durante l'eliminazione: ${errorMessage}` };
  }
}

// 8. Action: Aggiornare i Ruoli Attivi dell'Asta
export type UpdateActiveRolesFormState = { success: boolean; message: string };
export async function updateActiveRolesAction(
  prevState: UpdateActiveRolesFormState,
  formData: FormData
): Promise<UpdateActiveRolesFormState> {
  // 7.1. Autenticazione
  const { userId: adminUserId } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }

  // 7.2. Estrazione dati
  const leagueId = Number(formData.get("leagueId"));
  // getAll() recupera tutti i valori per un campo con lo stesso nome (per i checkbox)
  const activeRoles = formData.getAll("active_roles") as string[];

  if (!leagueId) {
    return { success: false, message: "ID lega mancante." };
  }

  // Converte l'array di ruoli in una stringa separata da virgole (es. "P,D,C,A")
  const activeRolesString = activeRoles.join(",");

  // 7.3. Chiamata diretta al DB (un servizio separato sarebbe eccessivo per una singola query)
  try {
    db.prepare(
      `UPDATE auction_leagues SET active_auction_roles = ? WHERE id = ?`
    ).run(activeRolesString, leagueId);

    // 7.4. Revalidazione del path per aggiornare la UI
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);

    return { success: true, message: "Ruoli attivi aggiornati!" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return { success: false, message: errorMessage };
  }
}
