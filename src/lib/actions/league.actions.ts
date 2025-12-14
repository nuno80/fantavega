// src/lib/actions/league.actions.ts v.1.9 (Async Migration)
// Migrated to async database operations for Turso compatibility

"use server";

// 1. Importazioni consolidate
import { revalidatePath } from "next/cache";

import { auth, clerkClient } from "@clerk/nextjs/server";

import { db } from "@/lib/db";
import {
  addParticipantToLeague,
  removeParticipantFromLeague,
  updateLeagueSettingForParticipantsJoining,
  updateLeagueStatus,
  updateParticipantTeamName,
  type LeagueSettingName,
} from "@/lib/db/services/auction-league.service";
import { CreateLeagueSchema } from "@/lib/validators/league.validators";

type AppRole = "admin" | "manager";

// Helper function to check admin role with fallback to Clerk API
async function checkIsAdmin(userId: string, sessionClaims: Record<string, unknown> | null): Promise<boolean> {
  // Tentativo 1: Cerca nei sessionClaims (se il Session Token è configurato correttamente)
  if (sessionClaims) {
    if ((sessionClaims.metadata as { role?: AppRole } | undefined)?.role === "admin") {
      return true;
    }
    if ((sessionClaims.publicMetadata as { role?: AppRole } | undefined)?.role === "admin") {
      return true;
    }
    const snakeCasePublicMeta = sessionClaims["public_metadata"] as { role?: AppRole } | undefined;
    if (snakeCasePublicMeta?.role === "admin") {
      return true;
    }
  }

  // Tentativo 2: Fallback a clerkClient per ottenere i publicMetadata direttamente da Clerk API
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const clerkRole = user.publicMetadata?.role as AppRole | undefined;
    if (clerkRole === "admin") {
      console.log("[checkIsAdmin] Admin role found via Clerk API fallback");
      return true;
    }
  } catch (error) {
    console.error("[checkIsAdmin] Error fetching user from Clerk API:", error);
  }

  return false;
}

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
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return { success: false, message: "Utente non autenticato." };
  }

  // Check if the user has the 'admin' role (with Clerk API fallback)
  const isAdmin = await checkIsAdmin(userId, sessionClaims as Record<string, unknown> | null);
  if (!isAdmin) {
    return { success: false, message: "Non sei autorizzato a creare leghe." };
  }

  const data = Object.fromEntries(formData.entries());
  console.log("[createLeague] Dati ricevuti dal form:", data);

  const validated = CreateLeagueSchema.safeParse(data);
  if (!validated.success) {
    console.log(
      "[createLeague] Errore di validazione:",
      validated.error.flatten().fieldErrors
    );
    return {
      success: false,
      message: "Errore di validazione.",
      errors: validated.error.flatten().fieldErrors,
    };
  }

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

    // eslint-disable-next-line prefer-const
    let newLeagueId: number;

    const transaction = await db.transaction("write");
    try {
      const fields = [
        "name",
        "league_type",
        "initial_budget_per_manager",
        "admin_creator_id",
        "slots_P",
        "slots_D",
        "slots_C",
        "slots_A",
        "timer_duration_minutes",
        "config_json",
        "status",
      ];
      const values = [
        name,
        league_type,
        initial_budget_per_manager,
        userId,
        slots_P,
        slots_D,
        slots_C,
        slots_A,
        timer_duration_minutes,
        config_json,
        "participants_joining",
      ];

      if (min_bid_rule === "fixed") {
        if (min_bid === undefined) {
          throw new Error("Min bid is required for fixed bid rule");
        }
        fields.push("min_bid");
        values.push(min_bid.toString());
      }

      const sql = `INSERT INTO auction_leagues (${fields.join(", ")}) VALUES (${fields
        .map(() => "?")
        .join(", ")}) RETURNING id`;

      console.log("[createLeague] Query SQL:", sql);
      console.log("[createLeague] Valori:", values);

      const leagueResult = await transaction.execute({
        sql,
        args: values,
      });

      // Handle returning id differently based on driver/client support, but RETURNING id is standard in SQLite
      // @libsql/client returns rows even for INSERT if RETURNING is used
      const id = leagueResult.rows[0]?.id as number;

      if (!id && leagueResult.lastInsertRowid) {
        newLeagueId = Number(leagueResult.lastInsertRowid);
      } else {
        newLeagueId = id;
      }

      await transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }

    console.log("[createLeague] Lega creata con ID:", newLeagueId);
    revalidatePath("/admin/leagues");
    return {
      success: true,
      message: `Lega creata con successo.`,
    };
  } catch (error) {
    console.error(
      "[createLeague] Errore durante la creazione della lega:",
      error
    );
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return {
        success: false,
        message: "Errore: Esiste già una lega con questo nome.",
        errors: { name: ["Questo nome è già in uso."] },
      };
    } else {
      console.error("[createLeague] Errore Dettagliato:", error);
      return {
        success: false,
        message: "Errore imprevisto durante la creazione.",
      };
    }
  }
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
      message: "Devi digitare 'ELIMINA' per confermare l'eliminazione.",
    };
  }

  try {
    // Verifica che l'admin sia il creatore della lega
    const leagueCheckResult = await db.execute({
      sql: `SELECT admin_creator_id, name FROM auction_leagues WHERE id = ?`,
      args: [leagueId],
    });
    const leagueCheck = leagueCheckResult.rows[0]
      ? {
        admin_creator_id: leagueCheckResult.rows[0].admin_creator_id as string,
        name: leagueCheckResult.rows[0].name as string
      }
      : undefined;

    if (!leagueCheck) {
      return { success: false, message: "Lega non trovata." };
    }

    if (leagueCheck.admin_creator_id !== adminUserId) {
      return {
        success: false,
        message: "Solo il creatore della lega può eliminarla.",
      };
    }

    // Elimina la lega (le foreign key CASCADE elimineranno automaticamente i dati correlati)
    const deleteResult = await db.execute({
      sql: `DELETE FROM auction_leagues WHERE id = ?`,
      args: [leagueId],
    });

    if (deleteResult.rowsAffected === 0) {
      return { success: false, message: "Errore durante l'eliminazione." };
    }

    revalidatePath("/admin/leagues");
    return {
      success: true,
      message: `Lega "${leagueCheck.name}" eliminata con successo.`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return {
      success: false,
      message: `Errore durante l'eliminazione: ${errorMessage}`,
    };
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
    await db.execute({
      sql: `UPDATE auction_leagues SET active_auction_roles = ? WHERE id = ?`,
      args: [activeRolesString, leagueId],
    });

    // 7.4. Revalidazione del path per aggiornare la UI
    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);

    return { success: true, message: "Ruoli attivi aggiornati!" };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return { success: false, message: errorMessage };
  }
}

// 9. Action: Aggiornare un'impostazione della Lega (durante participants_joining)
export type UpdateLeagueSettingFormState = { success: boolean; message: string };
export async function updateLeagueSettingAction(
  prevState: UpdateLeagueSettingFormState,
  formData: FormData
): Promise<UpdateLeagueSettingFormState> {
  const { userId: adminUserId, sessionClaims } = await auth();
  if (!adminUserId) {
    return { success: false, message: "Azione non autorizzata." };
  }

  // Verifica che l'utente sia admin
  const isAdmin = await checkIsAdmin(adminUserId, sessionClaims as Record<string, unknown> | null);
  if (!isAdmin) {
    return { success: false, message: "Solo gli admin possono modificare le impostazioni della lega." };
  }

  const leagueId = Number(formData.get("leagueId"));
  const settingName = formData.get("settingName") as LeagueSettingName;
  const newValue = formData.get("newValue") as string;

  if (!leagueId || !settingName || newValue === null || newValue === undefined) {
    return { success: false, message: "Dati mancanti." };
  }

  try {
    const result = await updateLeagueSettingForParticipantsJoining(
      leagueId,
      settingName,
      newValue
    );

    if (!result.success) {
      return { success: false, message: result.message };
    }

    revalidatePath(`/admin/leagues/${leagueId}/dashboard`);
    return { success: true, message: result.message };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    return { success: false, message: errorMessage };
  }
}
