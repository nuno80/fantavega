// src/lib/db/services/auction-league.service.ts v.2.0 (Async Turso Migration)
// Aggiunta l'importazione mancante di clerkClient.
// 1. Importazioni
import { clerkClient } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

// --- Tipi di Base ---
export interface AuctionLeague {
  id: number;
  name: string;
  league_type: "classic" | "mantra";
  initial_budget_per_manager: number;
  status:
  | "setup"
  | "participants_joining"
  | "draft_active"
  | "repair_active"
  | "market_closed"
  | "season_active"
  | "completed"
  | "archived";
  active_auction_roles: string | null;
  draft_window_start: number | null; // Timestamp Unix
  draft_window_end: number | null; // Timestamp Unix
  repair_1_window_start: number | null; // Timestamp Unix
  repair_1_window_end: number | null; // Timestamp Unix
  admin_creator_id: string;
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
  max_players_per_team: number; // Campo generato dalla DB
  config_json: string | null;
  created_at: number; // Timestamp Unix
  updated_at: number; // Timestamp Unix
}

export interface LeagueParticipant {
  league_id: number;
  user_id: string;
  current_budget: number;
  locked_credits: number;
  manager_team_name?: string | null;
  players_P_acquired: number;
  players_D_acquired: number;
  players_C_acquired: number;
  players_A_acquired: number;
  total_players_acquired: number; // Campo generato dalla DB
  joined_at: number; // Timestamp Unix
  user_username?: string; // Opzionale, per JOIN con users
  user_full_name?: string; // Opzionale, per JOIN con users
}

// Interfaccia specifica per i dati dei giocatori necessari per l'export CSV
interface RosterPlayerForExport {
  player_id: number;
  purchase_price: number;
  // Aggiungiamo ruolo e nome per l'ordinamento interno se necessario, anche se non direttamente nel CSV finale per riga
  role: string;
  name: string;
}

export interface CreateAuctionLeagueData {
  name: string;
  league_type: "classic" | "mantra";
  initial_budget_per_manager: number;
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
  config_json?: string | null; // Opzionale per la creazione
}

export interface UpdateAuctionLeagueData {
  name?: string;
  league_type?: "classic" | "mantra";
  initial_budget_per_manager?: number;
  status?: AuctionLeague["status"];
  active_auction_roles?: string | null;
  draft_window_start?: number | null;
  draft_window_end?: number | null;
  repair_1_window_start?: number | null;
  repair_1_window_end?: number | null;
  slots_P?: number;
  slots_D?: number;
  slots_C?: number;
  slots_A?: number;
  config_json?: string | null;
}

// NUOVA INTERFACCIA per lo stato di assegnazione di un giocatore
export interface PlayerAssignmentStatus {
  is_assigned: boolean;
  player_id?: number; // Presente solo se is_assigned è true
  league_id?: number; // Presente solo se is_assigned è true
  manager_user_id?: string | null;
  manager_username?: string | null;
  manager_full_name?: string | null;
  purchase_price?: number | null;
  assigned_at?: number | null; // Timestamp Unix
}

// NUOVA INTERFACCIA per i giocatori nella rosa
export interface RosterPlayer {
  // Campi da players
  player_id: number; // Rinominato da 'id' per chiarezza nel contesto della rosa
  name: string;
  role: string;
  team: string;
  // Potremmo voler includere la quotazione con cui è stato acquistato,
  // ma 'purchase_price' da player_assignments è più accurato per la rosa.
  // Se vuoi la quotazione attuale del giocatore (che può cambiare), aggiungi:
  // current_quotation: number;
  fvm: number | null;
  photo_url?: string | null;

  // Campi da player_assignments
  purchase_price: number;
  assigned_at: number; // Timestamp Unix
}

export interface ManagerWithRoster {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
  total_penalties: number;
  firstName?: string;
  lastName?: string;
  players: {
    id: number;
    name: string;
    role: string;
    team: string;
    assignment_price: number;
    assigned_at: number;
    photo_url?: string | null;
  }[];
}

export interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}

export interface ActiveAuction {
  id: number;
  player_id: number;
  player_name: string;
  player_role: string;
  player_team: string;
  player_photo_url: string | null;
  current_highest_bidder_id: string | null;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
}

export interface AutoBidCount {
  player_id: number;
  auto_bid_count: number;
}

export interface LeagueManagersData {
  managers: ManagerWithRoster[];
  leagueSlots: LeagueSlots;
  activeAuctions: ActiveAuction[];
  autoBids: AutoBidCount[];
  leagueStatus: string;
}

// --- Funzioni del Servizio ---

/**
 * Crea una nuova lega d'asta.
 * Solo l'admin può farlo.
 */
export const createAuctionLeague = async (
  data: CreateAuctionLeagueData,
  adminUserId: string
): Promise<AuctionLeague> => {
  const {
    name,
    league_type,
    initial_budget_per_manager,
    slots_P,
    slots_D,
    slots_C,
    slots_A,
    config_json,
  } = data;

  if (!name || name.trim() === "") {
    throw new Error("League name cannot be empty.");
  }
  if (
    typeof initial_budget_per_manager !== "number" ||
    initial_budget_per_manager <= 0
  ) {
    throw new Error("Initial budget must be a positive number.");
  }
  if (
    typeof slots_P !== "number" ||
    slots_P <= 0 ||
    typeof slots_D !== "number" ||
    slots_D <= 0 ||
    typeof slots_C !== "number" ||
    slots_C <= 0 ||
    typeof slots_A !== "number" ||
    slots_A <= 0
  ) {
    throw new Error("Player slots for each role must be positive numbers.");
  }

  const now = Math.floor(Date.now() / 1000);
  const initialStatus: AuctionLeague["status"] = "setup";

  try {
    const result = await db.execute({
      sql: `INSERT INTO auction_leagues (
        name, league_type, initial_budget_per_manager, status, admin_creator_id,
        slots_P, slots_D, slots_C, slots_A, config_json,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      ) RETURNING *`,
      args: [
        name.trim(),
        league_type,
        initial_budget_per_manager,
        initialStatus,
        adminUserId,
        slots_P,
        slots_D,
        slots_C,
        slots_A,
        config_json ?? null,
        now,
        now,
      ],
    });

    const newLeague = result.rows[0] as unknown as AuctionLeague | undefined;

    if (!newLeague) {
      console.error(
        "Failed to retrieve the new league directly after insert using RETURNING *."
      );
      throw new Error(
        "League creation failed or could not retrieve the created league data."
      );
    }

    return newLeague;
  } catch (error) {
    console.error(`Error in createAuctionLeague: ${error}`);
    if (error instanceof Error) {
      if (
        error.message
          .toLowerCase()
          .includes("unique constraint failed: auction_leagues.name")
      ) {
        throw new Error(`League name "${name.trim()}" already exists.`);
      }
    }
    throw new Error(
      "Failed to create auction league due to a database error or unexpected issue."
    );
  }
};

/**
 * Funzione GET leagues: Ottiene tutte le leghe create da un specifico admin.
 */
export const getAuctionLeaguesByAdmin = async (
  adminUserId: string
): Promise<AuctionLeague[]> => {
  console.log(
    `[SERVICE] getAuctionLeaguesByAdmin called for admin ID: ${adminUserId}`
  );
  try {
    const result = await db.execute({
      sql: "SELECT * FROM auction_leagues WHERE admin_creator_id = ? ORDER BY created_at DESC",
      args: [adminUserId],
    });
    const leagues = result.rows as unknown as AuctionLeague[];

    console.log(
      `[SERVICE] Found ${leagues.length} leagues for admin ID: ${adminUserId}`
    );
    return leagues;
  } catch (error) {
    console.error(
      `[SERVICE] Error in getAuctionLeaguesByAdmin for admin ${adminUserId}:`,
      error
    );
    throw new Error("Failed to retrieve leagues for admin.");
  }
};

/**
 * Ottiene una singola lega d'asta tramite il suo ID.
 * Verifica anche che l'admin che fa la richiesta sia il creatore.
 */
export const getAuctionLeagueByIdForAdmin = async (
  leagueId: number,
  adminUserId: string
): Promise<AuctionLeague | null> => {
  console.log(
    `[SERVICE] getAuctionLeagueByIdForAdmin called for league ID: ${leagueId}, by admin ID: ${adminUserId}`
  );
  try {
    const result = await db.execute({
      sql: "SELECT * FROM auction_leagues WHERE id = ? AND admin_creator_id = ?",
      args: [leagueId, adminUserId],
    });
    const league = result.rows[0] as unknown as AuctionLeague | undefined;

    if (!league) {
      console.log(
        `[SERVICE] League with ID: ${leagueId} not found or not owned by admin ID: ${adminUserId}`
      );
      return null;
    }

    console.log("[SERVICE] League found:", league);
    return league;
  } catch (error) {
    console.error(
      `[SERVICE] Error in getAuctionLeagueByIdForAdmin for league ${leagueId}:`,
      error
    );
    throw new Error("Failed to retrieve league by ID.");
  }
};

/**
 * Aggiorna una lega d'asta esistente.
 * Solo l'admin creatore può farlo.
 * Applica logica per campi modificabili in base allo status della lega.
 */
export const updateAuctionLeague = async (
  leagueId: number,
  data: UpdateAuctionLeagueData,
  adminUserId: string
): Promise<AuctionLeague> => {
  console.log(
    `[SERVICE] updateAuctionLeague called for league ID: ${leagueId}, by admin ID: ${adminUserId}, with data:`,
    data
  );

  const league = await getAuctionLeagueByIdForAdmin(leagueId, adminUserId);
  if (!league) {
    throw new Error("League not found or user is not authorized to update it.");
  }

  if (league.status !== "setup") {
    if (
      data.initial_budget_per_manager !== undefined &&
      data.initial_budget_per_manager !== league.initial_budget_per_manager
    ) {
      throw new Error(
        "Initial budget can only be changed when league status is 'setup'."
      );
    }
    if (
      (data.slots_P !== undefined && data.slots_P !== league.slots_P) ||
      (data.slots_D !== undefined && data.slots_D !== league.slots_D) ||
      (data.slots_C !== undefined && data.slots_C !== league.slots_C) ||
      (data.slots_A !== undefined && data.slots_A !== league.slots_A)
    ) {
      throw new Error(
        "Player slots can only be changed when league status is 'setup'."
      );
    }
  }
  if (data.name !== undefined && data.name.trim() === "") {
    throw new Error("League name cannot be empty.");
  }

  const fieldsToUpdate: string[] = [];
  const args: (string | number | null)[] = [];
  const now = Math.floor(Date.now() / 1000);

  if (data.name !== undefined && data.name !== league.name) {
    fieldsToUpdate.push("name = ?");
    args.push(data.name.trim());
  }
  if (
    data.league_type !== undefined &&
    data.league_type !== league.league_type
  ) {
    fieldsToUpdate.push("league_type = ?");
    args.push(data.league_type);
  }
  if (
    data.initial_budget_per_manager !== undefined &&
    data.initial_budget_per_manager !== league.initial_budget_per_manager
  ) {
    fieldsToUpdate.push("initial_budget_per_manager = ?");
    args.push(data.initial_budget_per_manager);
  }
  if (data.status !== undefined && data.status !== league.status) {
    fieldsToUpdate.push("status = ?");
    args.push(data.status);
  }
  if (
    data.active_auction_roles !== undefined &&
    data.active_auction_roles !== league.active_auction_roles
  ) {
    fieldsToUpdate.push("active_auction_roles = ?");
    args.push(data.active_auction_roles);
  }
  if (
    data.draft_window_start !== undefined &&
    data.draft_window_start !== league.draft_window_start
  ) {
    fieldsToUpdate.push("draft_window_start = ?");
    args.push(data.draft_window_start);
  }
  if (
    data.draft_window_end !== undefined &&
    data.draft_window_end !== league.draft_window_end
  ) {
    fieldsToUpdate.push("draft_window_end = ?");
    args.push(data.draft_window_end);
  }
  if (
    data.repair_1_window_start !== undefined &&
    data.repair_1_window_start !== league.repair_1_window_start
  ) {
    fieldsToUpdate.push("repair_1_window_start = ?");
    args.push(data.repair_1_window_start);
  }
  if (
    data.repair_1_window_end !== undefined &&
    data.repair_1_window_end !== league.repair_1_window_end
  ) {
    fieldsToUpdate.push("repair_1_window_end = ?");
    args.push(data.repair_1_window_end);
  }
  if (data.slots_P !== undefined && data.slots_P !== league.slots_P) {
    fieldsToUpdate.push("slots_P = ?");
    args.push(data.slots_P);
  }
  if (data.slots_D !== undefined && data.slots_D !== league.slots_D) {
    fieldsToUpdate.push("slots_D = ?");
    args.push(data.slots_D);
  }
  if (data.slots_C !== undefined && data.slots_C !== league.slots_C) {
    fieldsToUpdate.push("slots_C = ?");
    args.push(data.slots_C);
  }
  if (data.slots_A !== undefined && data.slots_A !== league.slots_A) {
    fieldsToUpdate.push("slots_A = ?");
    args.push(data.slots_A);
  }
  if (
    data.config_json !== undefined &&
    data.config_json !== league.config_json
  ) {
    fieldsToUpdate.push("config_json = ?");
    args.push(data.config_json);
  }

  if (fieldsToUpdate.length === 0) {
    console.log("[SERVICE] No fields to update for league ID:", leagueId);
    return league;
  }

  fieldsToUpdate.push("updated_at = ?");
  args.push(now);

  const setClause = fieldsToUpdate.join(", ");
  args.push(leagueId);
  args.push(adminUserId);

  try {
    const result = await db.execute({
      sql: `UPDATE auction_leagues SET ${setClause} WHERE id = ? AND admin_creator_id = ? RETURNING *`,
      args: args,
    });
    const updatedLeague = result.rows[0] as unknown as
      | AuctionLeague
      | undefined;

    if (!updatedLeague) {
      throw new Error(
        "Failed to update league or retrieve updated data. Ensure you are the league admin."
      );
    }

    console.log("[SERVICE] League updated successfully:", updatedLeague);
    return updatedLeague;
  } catch (error) {
    console.error(`[SERVICE] Error updating league ID ${leagueId}:`, error);
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: auction_leagues.name")
    ) {
      throw new Error(`League name "${data.name}" already exists.`);
    }
    throw new Error("Failed to update auction league.");
  }
};

/**
 * Aggiorna le impostazioni di una lega quando è in stato 'participants_joining'.
 * Se il budget cambia, aggiorna anche il current_budget di tutti i partecipanti.
 */
export interface UpdateLeagueSettingResult {
  success: boolean;
  message: string;
  updatedValue?: string | number | null;
}

export type LeagueSettingName =
  | 'name'
  | 'initial_budget_per_manager'
  | 'timer_duration_minutes'
  | 'league_type'
  | 'slots_P'
  | 'slots_D'
  | 'slots_C'
  | 'slots_A';

export async function updateLeagueSettingForParticipantsJoining(
  leagueId: number,
  settingName: LeagueSettingName,
  newValue: string | number
): Promise<UpdateLeagueSettingResult> {
  console.log(
    `[SERVICE] updateLeagueSettingForParticipantsJoining: league ${leagueId}, setting ${settingName}, value ${newValue}`
  );

  try {
    // 1. Verifica che la lega esista e sia in stato 'participants_joining'
    const leagueResult = await db.execute({
      sql: "SELECT id, status, initial_budget_per_manager FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as {
      id: number;
      status: string;
      initial_budget_per_manager: number;
    } | undefined;

    if (!league) {
      return { success: false, message: "Lega non trovata." };
    }

    if (league.status !== "participants_joining") {
      return {
        success: false,
        message: `Impossibile modificare le impostazioni quando la lega è nello stato '${league.status}'. Le modifiche sono permesse solo nello stato 'participants_joining'.`,
      };
    }

    // 2. Valida il nuovo valore in base al tipo di setting
    let validatedValue: string | number = newValue;

    switch (settingName) {
      case "name":
        if (typeof newValue !== "string" || newValue.trim() === "") {
          return { success: false, message: "Il nome della lega non può essere vuoto." };
        }
        validatedValue = newValue.trim();
        break;

      case "initial_budget_per_manager":
      case "timer_duration_minutes":
      case "slots_P":
      case "slots_D":
      case "slots_C":
      case "slots_A":
        const numValue = typeof newValue === "string" ? parseInt(newValue, 10) : newValue;
        if (isNaN(numValue) || numValue <= 0) {
          return { success: false, message: `Il valore deve essere un numero positivo.` };
        }
        validatedValue = numValue;
        break;

      case "league_type":
        if (newValue !== "classic" && newValue !== "mantra") {
          return { success: false, message: "Tipo lega non valido. Usa 'classic' o 'mantra'." };
        }
        validatedValue = newValue;
        break;

      default:
        return { success: false, message: `Setting '${settingName}' non supportato.` };
    }

    // 3. Esegui l'aggiornamento in una transazione
    const tx = await db.transaction("write");
    try {
      // Aggiorna il setting nella tabella auction_leagues
      await tx.execute({
        sql: `UPDATE auction_leagues SET ${settingName} = ?, updated_at = strftime('%s', 'now') WHERE id = ?`,
        args: [validatedValue, leagueId],
      });

      // 4. Se il budget è cambiato, aggiorna anche tutti i partecipanti
      if (settingName === "initial_budget_per_manager") {
        const oldBudget = league.initial_budget_per_manager;
        const newBudget = validatedValue as number;
        const budgetDifference = newBudget - oldBudget;

        if (budgetDifference !== 0) {
          // Aggiorna il current_budget di tutti i partecipanti
          await tx.execute({
            sql: `UPDATE league_participants
                  SET current_budget = current_budget + ?,
                      updated_at = strftime('%s', 'now')
                  WHERE league_id = ?`,
            args: [budgetDifference, leagueId],
          });

          // Registra la transazione di budget per ogni partecipante
          const participantsResult = await tx.execute({
            sql: "SELECT user_id, current_budget FROM league_participants WHERE league_id = ?",
            args: [leagueId],
          });
          const participants = participantsResult.rows as unknown as {
            user_id: string;
            current_budget: number;
          }[];

          for (const participant of participants) {
            await tx.execute({
              sql: `INSERT INTO budget_transactions
                    (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, description)
                    VALUES (?, ?, ?, ?, ?, ?)`,
              args: [
                leagueId,
                participant.user_id,
                budgetDifference > 0 ? "admin_budget_increase" : "admin_budget_decrease",
                budgetDifference,
                participant.current_budget,
                `Budget iniziale modificato da ${oldBudget} a ${newBudget} crediti`,
              ],
            });
          }

          console.log(
            `[SERVICE] Updated budget for ${participants.length} participants. Difference: ${budgetDifference}`
          );
        }
      }

      await tx.commit();

      console.log(`[SERVICE] Setting ${settingName} updated to ${validatedValue} for league ${leagueId}`);
      return {
        success: true,
        message: "Impostazione aggiornata con successo.",
        updatedValue: validatedValue,
      };
    } catch (txError) {
      await tx.rollback();
      throw txError;
    }
  } catch (error) {
    console.error(`[SERVICE] Error updating league setting:`, error);
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return { success: false, message: "Questo nome è già in uso da un'altra lega." };
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : "Errore sconosciuto.",
    };
  }
}

// --- Gestione Partecipanti Lega ---

export async function addParticipantToLeague(
  leagueId: number,
  adminUserId: string,
  participantUserId: string,
  teamName: string
): Promise<{
  success: boolean;
  message: string;
  participant_user_id?: string;
}> {
  try {
    const leagueResult = await db.execute({
      sql: "SELECT id, admin_creator_id, initial_budget_per_manager, status FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as
      | {
        id: number;
        admin_creator_id: string;
        initial_budget_per_manager: number;
        status: string;
      }
      | undefined;

    if (!league) throw new Error("Lega non trovata.");
    if (league.admin_creator_id !== adminUserId)
      throw new Error(
        "Solo l'amministratore della lega può aggiungere partecipanti."
      );
    if (!["setup", "participants_joining"].includes(league.status))
      throw new Error(
        `Non è possibile aggiungere partecipanti quando lo stato della lega è '${league.status}'.`
      );

    let userInDbResult = await db.execute({
      sql: "SELECT id, role, username, email FROM users WHERE id = ?",
      args: [participantUserId],
    });
    let userInDb = userInDbResult.rows[0] as unknown as
      | { id: string; role: string; username?: string; email?: string }
      | undefined;

    console.log(`[ADD_PARTICIPANT] Checking user ${participantUserId}:`, userInDb ? `Found (role: ${userInDb.role})` : 'Not found in DB');

    if (!userInDb) {
      console.log(
        `[SYNC] Utente ${participantUserId} non trovato nel DB locale. Tentativo di fetch da Clerk...`
      );
      try {
        const clerkUser = await (
          await clerkClient()
        ).users.getUser(participantUserId);

        if (clerkUser) {
          const primaryEmail = clerkUser.emailAddresses.find(
            (e) => e.id === clerkUser.primaryEmailAddressId
          )?.emailAddress;
          const clerkRole = (clerkUser.publicMetadata?.role as string) || "manager";

          console.log(`[SYNC] Clerk user found: ${clerkUser.id}, email: ${primaryEmail}, role from metadata: ${clerkRole}`);

          // Genera email e username unici se necessario per evitare conflitti UNIQUE
          const safeEmail = primaryEmail || `${clerkUser.id}@clerk.local`;
          const safeUsername = clerkUser.username || `user_${clerkUser.id.slice(-8)}`;

          try {
            // Prima prova INSERT normale
            await db.execute({
              sql: `INSERT INTO users (id, email, username, role, status)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      email = excluded.email,
                      username = excluded.username,
                      role = excluded.role,
                      updated_at = strftime('%s', 'now')`,
              args: [
                clerkUser.id,
                safeEmail,
                safeUsername,
                clerkRole,
                "active",
              ],
            });
          } catch (insertError) {
            // Se fallisce per UNIQUE constraint su email/username, prova con valori alternativi
            console.warn(`[SYNC] First insert attempt failed, trying with unique identifiers:`, insertError);
            const uniqueEmail = `${clerkUser.id}@clerk.local`;
            const uniqueUsername = `clerk_${clerkUser.id.slice(-12)}`;

            await db.execute({
              sql: `INSERT INTO users (id, email, username, role, status)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      role = excluded.role,
                      updated_at = strftime('%s', 'now')`,
              args: [
                clerkUser.id,
                uniqueEmail,
                uniqueUsername,
                clerkRole,
                "active",
              ],
            });
          }

          console.log(
            `[SYNC] Utente ${clerkUser.id} sincronizzato con successo nel DB locale (role: ${clerkRole}).`
          );
          userInDbResult = await db.execute({
            sql: "SELECT id, role, username, email FROM users WHERE id = ?",
            args: [participantUserId],
          });
          userInDb = userInDbResult.rows[0] as unknown as
            | { id: string; role: string; username?: string; email?: string }
            | undefined;

          console.log(`[SYNC] User after sync:`, userInDb);
        } else {
          throw new Error(
            `Utente con ID ${participantUserId} non trovato su Clerk.`
          );
        }
      } catch (clerkError) {
        console.error(
          `[SYNC] Errore durante il fetch/sync da Clerk per l'utente ${participantUserId}:`,
          clerkError
        );
        throw new Error(
          `Impossibile sincronizzare l'utente ${participantUserId}: ${clerkError instanceof Error ? clerkError.message : 'Errore sconosciuto'}`
        );
      }
    }

    if (!userInDb) {
      console.error(`[ADD_PARTICIPANT] User ${participantUserId} still not found after sync attempt`);
      throw new Error(
        `Sincronizzazione fallita per l'utente ${participantUserId}. Verifica i log del server.`
      );
    }

    // Permetti sia manager che admin di essere partecipanti
    if (userInDb.role !== "manager" && userInDb.role !== "admin") {
      throw new Error(
        `L'utente ${userInDb.username || userInDb.id} ha un ruolo non valido: '${userInDb.role}'.`
      );
    }

    const existingParticipantResult = await db.execute({
      sql: "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?",
      args: [leagueId, participantUserId],
    });
    if (existingParticipantResult.rows.length > 0)
      throw new Error(
        `L'utente ${userInDb.username || userInDb.id} è già un partecipante.`
      );

    // Transaction
    const tx = await db.transaction("write");
    try {
      await tx.execute({
        sql: `INSERT INTO league_participants (league_id, user_id, current_budget, manager_team_name) VALUES (?, ?, ?, ?)`,
        args: [
          leagueId,
          participantUserId,
          league.initial_budget_per_manager,
          teamName,
        ],
      });

      await tx.execute({
        sql: `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, description) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          leagueId,
          participantUserId,
          "initial_allocation",
          league.initial_budget_per_manager,
          league.initial_budget_per_manager,
          "Allocazione budget iniziale",
        ],
      });
      await tx.commit();
    } catch (txError) {
      await tx.rollback();
      throw txError;
    }

    return {
      success: true,
      message: "Partecipante aggiunto con successo.",
      participant_user_id: participantUserId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    console.error(
      `Errore nell'aggiungere il partecipante ${participantUserId} alla lega ${leagueId}:`,
      errorMessage
    );
    return { success: false, message: errorMessage };
  }
}

export const getLeagueParticipants = async (
  leagueId: number
): Promise<LeagueParticipant[]> => {
  console.log(
    `[SERVICE] getLeagueParticipants called for league ID: ${leagueId}`
  );
  try {
    const result = await db.execute({
      sql: `SELECT
         lp.*,
         u.username AS user_username,
         u.full_name AS user_full_name,
         u.avatar_url AS user_avatar_url
       FROM league_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.league_id = ?
       ORDER BY lp.joined_at ASC`,
      args: [leagueId],
    });
    const participants = result.rows as unknown as (LeagueParticipant & {
      user_username?: string;
      user_full_name?: string;
      user_avatar_url?: string;
    })[];

    console.log(
      `[SERVICE] Found ${participants.length} participants for league ID: ${leagueId}`
    );
    return participants;
  } catch (error) {
    console.error(
      `[SERVICE] Error in getLeagueParticipants for league ${leagueId}:`,
      error
    );
    throw new Error("Failed to retrieve league participants.");
  }
};

export async function removeParticipantFromLeague(
  leagueId: number,
  adminUserId: string,
  userIdToRemove: string
): Promise<{ success: boolean; message: string }> {
  console.log(
    `[SERVICE] removeParticipantFromLeague called for league ID: ${leagueId}, user to remove: ${userIdToRemove}, by admin ID: ${adminUserId}`
  );

  try {
    const leagueResult = await db.execute({
      sql: "SELECT admin_creator_id, status FROM auction_leagues WHERE id = ?",
      args: [leagueId],
    });
    const league = leagueResult.rows[0] as unknown as
      | { admin_creator_id: string; status: string }
      | undefined;

    if (!league) {
      throw new Error("Lega non trovata.");
    }
    if (league.admin_creator_id !== adminUserId) {
      throw new Error(
        "Azione non autorizzata: solo l'admin della lega può rimuovere partecipanti."
      );
    }

    if (league.status !== "participants_joining") {
      throw new Error(
        `Impossibile rimuovere partecipanti quando la lega è nello stato '${league.status}'.`
      );
    }

    const activeBidCheckResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM auctions WHERE auction_league_id = ? AND current_highest_bidder_id = ? AND status = 'active'`,
      args: [leagueId, userIdToRemove],
    });
    const activeBidCheck = activeBidCheckResult.rows[0] as unknown as {
      count: number;
    };

    if (activeBidCheck.count > 0) {
      throw new Error(
        `Impossibile rimuovere: il partecipante è il miglior offerente in un'asta attiva.`
      );
    }

    const tx = await db.transaction("write");
    try {
      await tx.execute({
        sql: `DELETE FROM player_assignments WHERE auction_league_id = ? AND user_id = ?`,
        args: [leagueId, userIdToRemove],
      });
      await tx.execute({
        sql: `DELETE FROM budget_transactions WHERE auction_league_id = ? AND user_id = ?`,
        args: [leagueId, userIdToRemove],
      });
      await tx.execute({
        sql: `DELETE FROM bids WHERE user_id = ? AND auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)`,
        args: [userIdToRemove, leagueId],
      });

      const deletedParticipantResult = await tx.execute({
        sql: `DELETE FROM league_participants WHERE league_id = ? AND user_id = ?`,
        args: [leagueId, userIdToRemove],
      });

      if (deletedParticipantResult.rowsAffected === 0) {
        throw new Error("Partecipante non trovato in questa lega.");
      }
      await tx.commit();
    } catch (txError) {
      await tx.rollback();
      throw txError;
    }

    return { success: true, message: "Partecipante rimosso con successo." };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    console.error(
      `Errore durante la rimozione del partecipante ${userIdToRemove} dalla lega ${leagueId}:`,
      errorMessage
    );
    return { success: false, message: errorMessage };
  }
}

export const getManagerRoster = async (
  leagueId: number,
  managerUserId: string
): Promise<RosterPlayer[]> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Getting roster for manager ${managerUserId} in league ${leagueId}`
  );

  try {
    const result = await db.execute({
      sql: `
      SELECT
        p.id AS player_id,
        p.name,
        p.role,
        p.team,
        p.fvm,
        p.photo_url,
        pa.purchase_price,
        pa.assigned_at
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = ? AND pa.user_id = ?
      ORDER BY
        CASE p.role  -- Ordinamento personalizzato per ruolo: P, D, C, A
          WHEN 'P' THEN 1
          WHEN 'D' THEN 2
          WHEN 'C' THEN 3
          WHEN 'A' THEN 4
          ELSE 5
        END,
        p.name ASC
    `,
      args: [leagueId, managerUserId],
    });

    const roster = result.rows as unknown as RosterPlayer[];

    console.log(
      `[SERVICE AUCTION_LEAGUE] Found ${roster.length} players in roster for manager ${managerUserId}, league ${leagueId}.`
    );
    return roster;
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error retrieving manager roster.";
    console.error(
      `[SERVICE AUCTION_LEAGUE] Error getting roster for manager ${managerUserId}, league ${leagueId}: ${errorMessage}`,
      error
    );
    throw new Error(`Failed to retrieve manager roster: ${errorMessage}`);
  }
};

export const getPlayerAssignmentStatus = async (
  leagueId: number,
  playerId: number
): Promise<PlayerAssignmentStatus> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Getting assignment status for player ${playerId} in league ${leagueId}`
  );

  try {
    const result = await db.execute({
      sql: `
      SELECT
        pa.user_id AS manager_user_id,
        u.username AS manager_username,
        u.full_name AS manager_full_name,
        pa.purchase_price,
        pa.assigned_at
      FROM player_assignments pa
      JOIN users u ON pa.user_id = u.id
      WHERE pa.auction_league_id = ? AND pa.player_id = ?
    `,
      args: [leagueId, playerId],
    });

    const assignment = result.rows[0] as unknown as
      | Omit<PlayerAssignmentStatus, "is_assigned" | "player_id" | "league_id">
      | undefined;

    if (assignment) {
      console.log(
        `[SERVICE AUCTION_LEAGUE] Player ${playerId} is assigned to manager ${assignment.manager_user_id} in league ${leagueId}.`
      );
      return {
        is_assigned: true,
        player_id: playerId,
      };
    } else {
      console.log(
        `[SERVICE AUCTION_LEAGUE] Player ${playerId} is not assigned in league ${leagueId}.`
      );
      return {
        is_assigned: false,
        player_id: playerId,
        league_id: leagueId,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error retrieving player assignment status.";
    console.error(
      `[SERVICE AUCTION_LEAGUE] Error getting assignment status for player ${playerId}, league ${leagueId}: ${errorMessage}`,
      error
    );
    throw new Error(
      `Failed to retrieve player assignment status: ${errorMessage}`
    );
  }
};

export const getLeagueRostersForCsvExport = async (
  leagueId: number
): Promise<string[]> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Preparing CSV export data for league ${leagueId}`
  );
  const csvRows: string[] = [];

  try {
    const participantsResult = await db.execute({
      sql: `
      SELECT
        lp.user_id,
        COALESCE(lp.manager_team_name, u.username, u.id) AS effective_team_name
      FROM league_participants lp
      JOIN users u ON lp.user_id = u.id
      WHERE lp.league_id = ?
      ORDER BY effective_team_name ASC
    `,
      args: [leagueId],
    });
    const participants = participantsResult.rows as unknown as {
      user_id: string;
      effective_team_name: string;
    }[];

    if (participants.length === 0) {
      return [];
    }

    const rosterQuery = `
      SELECT
        p.id AS player_id,
        pa.purchase_price
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = ? AND pa.user_id = ?
      ORDER BY
        CASE p.role
          WHEN 'P' THEN 1
          WHEN 'D' THEN 2
          WHEN 'C' THEN 3
          WHEN 'A' THEN 4
          ELSE 5
        END,
        p.name ASC
    `;

    for (const participant of participants) {
      const rosterResult = await db.execute({
        sql: rosterQuery,
        args: [leagueId, participant.user_id],
      });
      const rosterPlayers = rosterResult.rows as unknown as RosterPlayerForExport[];

      if (csvRows.length > 0 || rosterPlayers.length > 0) {
        csvRows.push("$,$,$");
      }

      if (rosterPlayers.length > 0) {
        rosterPlayers.forEach((player) => {
          const csvRow = `${participant.effective_team_name},${player.player_id},${player.purchase_price}`;
          csvRows.push(csvRow);
        });
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error preparing CSV data.";
    console.error(
      `[SERVICE AUCTION_LEAGUE] Error preparing CSV data for league ${leagueId}: ${errorMessage}`,
      error
    );
    throw new Error(`Failed to prepare CSV data: ${errorMessage}`);
  }

  console.log(
    `[SERVICE AUCTION_LEAGUE] CSV data preparation finished for league ${leagueId}. Total rows: ${csvRows.length}`
  );
  return csvRows;
};

// 5. Tipi e Funzioni per la Dashboard di Gestione Lega

export interface LeagueParticipantDetails {
  userId: string;
  username: string | null;
  teamName: string | null;
  currentBudget: number;
  lockedCredits: number;
  joinedAt: number;
}

export interface LeagueDashboardDetails {
  id: number;
  name: string;
  status: string;
  leagueType: string;
  initialBudget: number;
  timerDurationMinutes: number;
  participants: LeagueParticipantDetails[];
  activeAuctionRoles: string | null;
}

export async function getLeagueDetailsForAdminDashboard(
  leagueId: number
): Promise<LeagueDashboardDetails | null> {
  const leagueResult = await db.execute({
    sql: `SELECT
        id,
        name,
        status,
        league_type as leagueType,
        initial_budget_per_manager as initialBudget,
        timer_duration_minutes as timerDurationMinutes,
        active_auction_roles as activeAuctionRoles
       FROM auction_leagues
       WHERE id = ?`,
    args: [leagueId],
  });
  const league = leagueResult.rows[0] as unknown as
    | Omit<LeagueDashboardDetails, "participants">
    | undefined;

  if (!league) {
    return null;
  }

  const participantsResult = await db.execute({
    sql: `SELECT
          lp.user_id as userId,
          u.username,
          lp.manager_team_name as teamName,
          lp.current_budget as currentBudget,
          lp.locked_credits as lockedCredits,
          lp.joined_at as joinedAt
       FROM league_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.league_id = ?
       ORDER BY lp.joined_at ASC`,
    args: [leagueId],
  });
  const participants = participantsResult.rows as unknown as LeagueParticipantDetails[];

  return {
    ...league,
    participants,
  };
}

export async function updateLeagueStatus(
  leagueId: number,
  newStatus: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db.execute({
      sql: `UPDATE auction_leagues SET status = ? WHERE id = ?`,
      args: [newStatus, leagueId],
    });

    if (result.rowsAffected === 0) {
      throw new Error(
        `Nessuna lega trovata con ID ${leagueId}, o lo stato è già '${newStatus}'.`
      );
    }

    // Notifica tutti i client nella lega del cambio di stato
    try {
      const { notifySocketServer } = await import("@/lib/socket-emitter");
      await notifySocketServer({
        event: "league-status-changed",
        room: `league-${leagueId}`,
        data: {
          leagueId,
          newStatus,
          timestamp: Date.now(),
        },
      });
      console.log(`[SOCKET] Notificato cambio stato lega ${leagueId} a '${newStatus}'`);
    } catch (socketError) {
      console.warn(`[SOCKET] Errore notifica cambio stato:`, socketError);
      // Non blocchiamo l'operazione se la notifica socket fallisce
    }

    return {
      success: true,
      message: `Stato della lega aggiornato a '${newStatus}'.`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    console.error(
      `Errore durante l'aggiornamento dello stato per la lega ${leagueId}:`,
      errorMessage
    );
    return { success: false, message: errorMessage };
  }
}

// 7. Tipi e Funzioni per la Lista delle Leghe

export interface LeagueForAdminList {
  id: number;
  name: string;
  status: string;
  leagueType: string;
  participantCount: number;
  adminCreatorId: string;
}

export async function getLeaguesForAdminList(): Promise<LeagueForAdminList[]> {
  try {
    const result = await db.execute({
      sql: `
      SELECT
        al.id,
        al.name,
        al.status,
        al.league_type as leagueType,
        al.admin_creator_id as adminCreatorId,
        (SELECT COUNT(*) FROM league_participants lp WHERE lp.league_id = al.id) as participantCount
      FROM
        auction_leagues al
      ORDER BY
        al.created_at DESC
    `,
      args: [],
    });
    const leagues = result.rows as unknown as LeagueForAdminList[];

    return leagues;
  } catch (error) {
    console.error("Errore nel recuperare la lista delle leghe:", error);
    return [];
  }
}

export async function updateParticipantTeamName(
  leagueId: number,
  userId: string,
  newTeamName: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (newTeamName.length < 3) {
      throw new Error(
        "Il nome della squadra deve essere di almeno 3 caratteri."
      );
    }

    const result = await db.execute({
      sql: `UPDATE league_participants SET manager_team_name = ? WHERE league_id = ? AND user_id = ?`,
      args: [newTeamName, leagueId, userId],
    });

    if (result.rowsAffected === 0) {
      throw new Error("Partecipante non trovato in questa lega.");
    }

    return { success: true, message: "Nome squadra aggiornato con successo." };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Errore sconosciuto.";
    console.error(
      `Errore durante l'aggiornamento del nome squadra per l'utente ${userId} nella lega ${leagueId}:`,
      errorMessage
    );
    return { success: false, message: errorMessage };
  }
}

export const getLeagueManagersWithRosters = async (
  leagueId: number
): Promise<LeagueManagersData> => {
  // 1. Get league slots and status
  const leagueResult = await db.execute({
    sql: "SELECT slots_P, slots_D, slots_C, slots_A, status FROM auction_leagues WHERE id = ?",
    args: [leagueId],
  });
  const leagueRow = leagueResult.rows[0] as unknown as LeagueSlots & { status: string };
  const leagueSlots: LeagueSlots = {
    slots_P: leagueRow.slots_P,
    slots_D: leagueRow.slots_D,
    slots_C: leagueRow.slots_C,
    slots_A: leagueRow.slots_A,
  };
  const leagueStatus = leagueRow.status;

  // 2. Get active auctions
  const activeAuctionsResult = await db.execute({
    sql: `
        SELECT
          a.id,
          a.player_id,
          p.name as player_name,
          p.role as player_role,
          p.team as player_team,
          p.photo_url as player_photo_url,
          a.current_highest_bidder_id,
          a.current_highest_bid_amount,
          a.scheduled_end_time
        FROM auctions a
        JOIN players p ON a.player_id = p.id
        WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing')
      `,
    args: [leagueId],
  });
  const activeAuctions = activeAuctionsResult.rows as unknown as ActiveAuction[];

  // 3. Get auto bids counts
  const autoBidsResult = await db.execute({
    sql: `
        SELECT a.player_id, COUNT(*) as auto_bid_count
        FROM auto_bids ab
        JOIN auctions a ON ab.auction_id = a.id
        WHERE a.auction_league_id = ? AND a.status = 'active' AND ab.is_active = 1
        GROUP BY a.player_id
      `,
    args: [leagueId],
  });
  const autoBids = autoBidsResult.rows as unknown as AutoBidCount[];

  // 4. Get managers and their rosters
  const participants = await getLeagueParticipants(leagueId);
  const managers: ManagerWithRoster[] = [];

  // Get league initial budget
  const leagueSettingsResult = await db.execute({
    sql: "SELECT initial_budget_per_manager FROM auction_leagues WHERE id = ?",
    args: [leagueId]
  });
  const initialBudget = leagueSettingsResult.rows[0]?.initial_budget_per_manager as number || 500;

  for (const p of participants) {
    const roster = await getManagerRoster(leagueId, p.user_id);
    // Get total penalties
    const penaltiesResult = await db.execute({
      sql: "SELECT COALESCE(SUM(amount), 0) as total FROM budget_transactions WHERE auction_league_id = ? AND user_id = ? AND transaction_type = 'penalty_requirement'",
      args: [leagueId, p.user_id],
    });
    const totalPenalties = penaltiesResult.rows[0]?.total as number || 0;

    managers.push({
      user_id: p.user_id,
      manager_team_name: p.manager_team_name || p.user_username || "Team",
      current_budget: p.current_budget,
      locked_credits: p.locked_credits,
      total_budget: initialBudget,
      total_penalties: totalPenalties,
      firstName: p.user_full_name?.split(" ")[0],
      lastName: p.user_full_name?.split(" ").slice(1).join(" "),
      players: roster.map(rp => ({
        id: rp.player_id,
        name: rp.name,
        role: rp.role,
        team: rp.team,
        assignment_price: rp.purchase_price,
        assigned_at: rp.assigned_at,
        photo_url: rp.photo_url
      })),
    });
  }

  return {
    managers,
    leagueSlots,
    activeAuctions,
    autoBids,
    leagueStatus,
  };
};
