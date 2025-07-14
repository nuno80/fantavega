// src/lib/db/services/auction-league.service.ts v.1.11
// Aggiunta l'importazione mancante di clerkClient.
// 1. Importazioni
import { clerkClient } from "@clerk/nextjs/server";

import { db } from "@/lib/db";

type AppRole = "admin" | "manager";

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

  // Campi da player_assignments
  purchase_price: number;
  assigned_at: number; // Timestamp Unix
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
    // Nota: max_players_per_team è un campo generato, non serve specificarlo nell'INSERT.
    // draft_window_start, draft_window_end, repair_1_window_start, repair_1_window_end
    // e active_auction_roles saranno null/default all'inizio.
    const stmt = db.prepare(
      `INSERT INTO auction_leagues (
        name, league_type, initial_budget_per_manager, status, admin_creator_id,
        slots_P, slots_D, slots_C, slots_A, config_json,
        created_at, updated_at
      ) VALUES (
        @name, @league_type, @initial_budget_per_manager, @status, @admin_creator_id,
        @slots_P, @slots_D, @slots_C, @slots_A, @config_json,
        @created_at, @updated_at
      ) RETURNING *`
    );

    // Esegui la query e fai un cast al tipo atteso.
    // .get() è corretto per RETURNING * quando ci si aspetta una singola riga.
    const newLeague = stmt.get({
      name: name.trim(),
      league_type,
      initial_budget_per_manager,
      status: initialStatus,
      admin_creator_id: adminUserId,
      slots_P,
      slots_D,
      slots_C,
      slots_A,
      config_json: config_json ?? null, // Assicura che sia null se undefined
      created_at: now,
      updated_at: now,
    }) as AuctionLeague | undefined; // Cast perché .get può restituire undefined

    if (!newLeague) {
      // Questo blocco è un paracadute. Con RETURNING *, better-sqlite3 dovrebbe popolare newLeague.
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
      // Verifica se l'errore è dovuto a un vincolo di unicità sul nome
      // Il messaggio esatto può variare leggermente a seconda della versione di SQLite/better-sqlite3
      if (
        error.message
          .toLowerCase()
          .includes("unique constraint failed: auction_leagues.name")
      ) {
        throw new Error(`League name "${name.trim()}" already exists.`);
      }
    }
    // Per altri errori, solleva un errore più generico
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
    const stmt = db.prepare(
      "SELECT * FROM auction_leagues WHERE admin_creator_id = ? ORDER BY created_at DESC"
    );
    const leagues = stmt.all(adminUserId) as AuctionLeague[];

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
    const stmt = db.prepare(
      "SELECT * FROM auction_leagues WHERE id = ? AND admin_creator_id = ?"
    );
    // stmt.get() restituisce la riga o undefined se non trovata
    const league = stmt.get(leagueId, adminUserId) as AuctionLeague | undefined;

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
  data: UpdateAuctionLeagueData, // Assicurati che UpdateAuctionLeagueData sia definita/importata
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

  // Logica di validazione: quali campi possono essere aggiornati e quando?
  // Esempio: initial_budget e slots modificabili solo se lo status è 'setup'
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
  // Altre validazioni qui (es. name non vuoto se fornito)
  if (data.name !== undefined && data.name.trim() === "") {
    throw new Error("League name cannot be empty.");
  }

  // Costruisci la parte SET della query dinamicamente
  const fieldsToUpdate: string[] = [];
  const values: (string | number | null)[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Aggiungi i campi da aggiornare solo se sono presenti nei dati e diversi dal valore attuale
  // (o se vuoi permettere di impostare a null)
  if (data.name !== undefined && data.name !== league.name) {
    fieldsToUpdate.push("name = ?");
    values.push(data.name.trim());
  }
  if (
    data.league_type !== undefined &&
    data.league_type !== league.league_type
  ) {
    fieldsToUpdate.push("league_type = ?");
    values.push(data.league_type);
  }
  if (
    data.initial_budget_per_manager !== undefined &&
    data.initial_budget_per_manager !== league.initial_budget_per_manager
  ) {
    fieldsToUpdate.push("initial_budget_per_manager = ?");
    values.push(data.initial_budget_per_manager);
  }
  if (data.status !== undefined && data.status !== league.status) {
    fieldsToUpdate.push("status = ?");
    values.push(data.status);
  }
  if (
    data.active_auction_roles !== undefined &&
    data.active_auction_roles !== league.active_auction_roles
  ) {
    fieldsToUpdate.push("active_auction_roles = ?");
    values.push(data.active_auction_roles);
  }
  // Aggiungi qui gli altri campi aggiornabili: draft_window_start/end, repair_1_window_start/end, slots_P/D/C/A, config_json
  if (
    data.draft_window_start !== undefined &&
    data.draft_window_start !== league.draft_window_start
  ) {
    fieldsToUpdate.push("draft_window_start = ?");
    values.push(data.draft_window_start);
  }
  if (
    data.draft_window_end !== undefined &&
    data.draft_window_end !== league.draft_window_end
  ) {
    fieldsToUpdate.push("draft_window_end = ?");
    values.push(data.draft_window_end);
  }
  if (
    data.repair_1_window_start !== undefined &&
    data.repair_1_window_start !== league.repair_1_window_start
  ) {
    fieldsToUpdate.push("repair_1_window_start = ?");
    values.push(data.repair_1_window_start);
  }
  if (
    data.repair_1_window_end !== undefined &&
    data.repair_1_window_end !== league.repair_1_window_end
  ) {
    fieldsToUpdate.push("repair_1_window_end = ?");
    values.push(data.repair_1_window_end);
  }
  if (data.slots_P !== undefined && data.slots_P !== league.slots_P) {
    fieldsToUpdate.push("slots_P = ?");
    values.push(data.slots_P);
  }
  if (data.slots_D !== undefined && data.slots_D !== league.slots_D) {
    fieldsToUpdate.push("slots_D = ?");
    values.push(data.slots_D);
  }
  if (data.slots_C !== undefined && data.slots_C !== league.slots_C) {
    fieldsToUpdate.push("slots_C = ?");
    values.push(data.slots_C);
  }
  if (data.slots_A !== undefined && data.slots_A !== league.slots_A) {
    fieldsToUpdate.push("slots_A = ?");
    values.push(data.slots_A);
  }
  if (
    data.config_json !== undefined &&
    data.config_json !== league.config_json
  ) {
    fieldsToUpdate.push("config_json = ?");
    values.push(data.config_json);
  }

  if (fieldsToUpdate.length === 0) {
    console.log("[SERVICE] No fields to update for league ID:", leagueId);
    return league; // Nessun cambiamento, restituisci la lega esistente
  }

  fieldsToUpdate.push("updated_at = ?");
  values.push(now);

  const setClause = fieldsToUpdate.join(", ");
  values.push(leagueId); // Per la clausola WHERE id = ?
  values.push(adminUserId); // Per la clausola WHERE admin_creator_id = ?

  try {
    const updateStmt = db.prepare(
      `UPDATE auction_leagues SET ${setClause} WHERE id = ? AND admin_creator_id = ? RETURNING *`
    );
    const updatedLeague = updateStmt.get(...values) as
      | AuctionLeague
      | undefined;

    if (!updatedLeague) {
      // Questo potrebbe accadere se l'ID è corretto ma l'adminUserId non matcha più (improbabile se il check sopra è passato)
      // o se c'è un problema con RETURNING *.
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

// --- Gestione Partecipanti Lega ---

//Aggiunge un utente (manager) a una lega d'asta.
//Solo l'admin creatore della lega può farlo.

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
    // --- FASE 1: OPERAZIONI ASINCRONE E DI LETTURA (FUORI DALLA TRANSAZIONE) ---

    // 1.1. Validazione Lega e Autorizzazione Admin
    const league = db
      .prepare(
        "SELECT id, admin_creator_id, initial_budget_per_manager, status FROM auction_leagues WHERE id = ?"
      )
      .get(leagueId) as
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

    // 1.2. Validazione e Sincronizzazione Utente
    let userInDb = db
      .prepare("SELECT id, role, username FROM users WHERE id = ?")
      .get(participantUserId) as
      | { id: string; role: string; username?: string }
      | undefined;

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
          // Inseriamo l'utente nel nostro DB locale (questa è un'operazione di scrittura, ma la facciamo qui per semplicità)
          db.prepare(
            `INSERT OR IGNORE INTO users (id, email, username, role, status) VALUES (?, ?, ?, ?, ?)`
          ).run(
            clerkUser.id,
            primaryEmail || "no-email@example.com",
            clerkUser.username,
            (clerkUser.publicMetadata?.role as string) || "manager",
            "active"
          );
          console.log(
            `[SYNC] Utente ${clerkUser.id} sincronizzato con successo nel DB locale.`
          );
          // Ora lo rileggiamo dal DB per continuare
          userInDb = db
            .prepare("SELECT id, role, username FROM users WHERE id = ?")
            .get(participantUserId) as
            | { id: string; role: string; username?: string }
            | undefined;
        } else {
          throw new Error(
            `Utente con ID ${participantUserId} non trovato su Clerk.`
          );
        }
      } catch (clerkError) {
        console.error(
          `[SYNC] Errore durante il fetch da Clerk per l'utente ${participantUserId}:`,
          clerkError
        );
        throw new Error(
          `Impossibile verificare l'utente ${participantUserId} su Clerk.`
        );
      }
    }

    if (!userInDb)
      throw new Error(
        `Sincronizzazione fallita per l'utente ${participantUserId}.`
      );
    if (userInDb.role !== "manager")
      throw new Error(
        `L'utente ${userInDb.username || userInDb.id} non è un 'manager'.`
      );

    // 1.3. Controllo Duplicati
    const existingParticipant = db
      .prepare(
        "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?"
      )
      .get(leagueId, participantUserId);
    if (existingParticipant)
      throw new Error(
        `L'utente ${userInDb.username || userInDb.id} è già un partecipante.`
      );

    // --- FASE 2: OPERAZIONI DI SCRITTURA SINCRONE (DENTRO LA TRANSAZIONE) ---
    db.transaction(() => {
      // Inserisci il nuovo partecipante
      db.prepare(
        `INSERT INTO league_participants (league_id, user_id, current_budget, manager_team_name) VALUES (?, ?, ?, ?)`
      ).run(
        leagueId,
        participantUserId,
        league.initial_budget_per_manager,
        teamName
      );

      // Registra la transazione di budget iniziale
      db.prepare(
        `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, description) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        leagueId,
        participantUserId,
        "initial_allocation",
        league.initial_budget_per_manager,
        league.initial_budget_per_manager,
        "Allocazione budget iniziale"
      );
    })();

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

/**
 * Ottiene tutti i partecipanti di una lega d'asta, includendo alcuni dettagli dell'utente.
 */
export const getLeagueParticipants = async (
  leagueId: number
): Promise<LeagueParticipant[]> => {
  console.log(
    `[SERVICE] getLeagueParticipants called for league ID: ${leagueId}`
  );
  try {
    const stmt = db.prepare(
      `SELECT 
         lp.*, 
         u.username AS user_username, 
         u.full_name AS user_full_name,
         u.avatar_url AS user_avatar_url 
       FROM league_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.league_id = ?
       ORDER BY lp.joined_at ASC`
    );
    const participants = stmt.all(leagueId) as (LeagueParticipant & {
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
  adminUserId: string, // L'ID dell'admin che esegue l'azione
  userIdToRemove: string // L'ID dell'utente da rimuovere
): Promise<{ success: boolean; message: string }> {
  console.log(`[SERVICE] removeParticipantFromLeague called for league ID: ${leagueId}, user to remove: ${userIdToRemove}, by admin ID: ${adminUserId}`);
  
  try {
    // --- FASE 1: Controlli di Prevenzione (FUORI dalla transazione) ---
    
    // 1.1. Verifica che la lega esista e che l'esecutore sia l'admin
    const league = db.prepare(
      "SELECT admin_creator_id, status FROM auction_leagues WHERE id = ?"
    ).get(leagueId) as { admin_creator_id: string; status: string; } | undefined;

    if (!league) {
      throw new Error("Lega non trovata.");
    }
    if (league.admin_creator_id !== adminUserId) {
      throw new Error("Azione non autorizzata: solo l'admin della lega può rimuovere partecipanti.");
    }

    // 1.2. REGOLA DI BUSINESS CRITICA: Controlla lo stato della lega
    if (league.status !== 'participants_joining') {
      throw new Error(`Impossibile rimuovere partecipanti quando la lega è nello stato '${league.status}'.`);
    }

    // 1.3. Controlla se l'utente è il miglior offerente in un'asta (sicurezza aggiuntiva)
    const activeBidCheck = db.prepare(
      `SELECT COUNT(*) as count FROM auctions WHERE auction_league_id = ? AND current_highest_bidder_id = ? AND status = 'active'`
    ).get(leagueId, userIdToRemove) as { count: number };

    if (activeBidCheck.count > 0) {
      throw new Error(`Impossibile rimuovere: il partecipante è il miglior offerente in un'asta attiva.`);
    }

    // --- FASE 2: Esecuzione della Rimozione Atomica (DENTRO la transazione) ---
    db.transaction(() => {
      // Rimuovi tutte le dipendenze prima di rimuovere il partecipante
      db.prepare(`DELETE FROM player_assignments WHERE auction_league_id = ? AND user_id = ?`).run(leagueId, userIdToRemove);
      db.prepare(`DELETE FROM budget_transactions WHERE auction_league_id = ? AND user_id = ?`).run(leagueId, userIdToRemove);
      db.prepare(`DELETE FROM bids WHERE user_id = ? AND auction_id IN (SELECT id FROM auctions WHERE auction_league_id = ?)`).run(userIdToRemove, leagueId);
      
      const deletedParticipant = db.prepare(`DELETE FROM league_participants WHERE league_id = ? AND user_id = ?`).run(leagueId, userIdToRemove).changes;
      if (deletedParticipant === 0) {
        throw new Error("Partecipante non trovato in questa lega.");
      }
    })();

    return { success: true, message: 'Partecipante rimosso con successo.' };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto.';
    console.error(`Errore durante la rimozione del partecipante ${userIdToRemove} dalla lega ${leagueId}:`, errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Recupera la rosa dei giocatori assegnati a un manager specifico in una lega.
 * @param leagueId L'ID della lega.
 * @param managerUserId L'ID del manager.
 * @returns Una Promise che risolve in un array di RosterPlayer.
 */
export const getManagerRoster = async (
  leagueId: number,
  managerUserId: string
): Promise<RosterPlayer[]> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Getting roster for manager ${managerUserId} in league ${leagueId}`
  );

  try {
    const stmt = db.prepare(`
      SELECT
        p.id AS player_id, 
        p.name,
        p.role,
        p.team,
        p.fvm, 
        pa.purchase_price,
        pa.assigned_at
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = @leagueId AND pa.user_id = @managerUserId
      ORDER BY 
        CASE p.role  -- Ordinamento personalizzato per ruolo: P, D, C, A
          WHEN 'P' THEN 1
          WHEN 'D' THEN 2
          WHEN 'C' THEN 3
          WHEN 'A' THEN 4
          ELSE 5
        END,
        p.name ASC -- Poi per nome all'interno di ogni ruolo
    `);

    const roster = stmt.all({
      leagueId: leagueId,
      managerUserId: managerUserId,
    }) as RosterPlayer[];

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

/**
 * Recupera lo stato di assegnazione di un giocatore specifico in una lega.
 * @param leagueId L'ID della lega.
 * @param playerId L'ID del giocatore.
 * @returns Una Promise che risolve in un oggetto PlayerAssignmentStatus.
 */
export const getPlayerAssignmentStatus = async (
  leagueId: number,
  playerId: number
): Promise<PlayerAssignmentStatus> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Getting assignment status for player ${playerId} in league ${leagueId}`
  );

  try {
    const stmt = db.prepare(`
      SELECT
        pa.user_id AS manager_user_id,
        u.username AS manager_username,
        u.full_name AS manager_full_name,
        pa.purchase_price,
        pa.assigned_at
      FROM player_assignments pa
      JOIN users u ON pa.user_id = u.id
      WHERE pa.auction_league_id = @leagueId AND pa.player_id = @playerId
    `);

    const assignment = stmt.get({
      leagueId: leagueId,
      playerId: playerId,
    }) as
      | Omit<PlayerAssignmentStatus, "is_assigned" | "player_id" | "league_id">
      | undefined; // Omit per evitare conflitti con i campi che aggiungiamo

    if (assignment) {
      console.log(
        `[SERVICE AUCTION_LEAGUE] Player ${playerId} is assigned to manager ${assignment.manager_user_id} in league ${leagueId}.`
      );
      return {
        is_assigned: true,
        player_id: playerId,
        league_id: leagueId,
        ...assignment,
      };
    } else {
      console.log(
        `[SERVICE AUCTION_LEAGUE] Player ${playerId} is not assigned in league ${leagueId}.`
      );
      return {
        is_assigned: false,
        player_id: playerId, // Includiamo comunque per riferimento
        league_id: leagueId, // Includiamo comunque per riferimento
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

/**
 * Prepara i dati per l'esportazione CSV delle rose di tutti i manager in una lega.
 * @param leagueId L'ID della lega.
 * @returns Una Promise che risolve in un array di stringhe, dove ogni stringa è una riga CSV.
 */
export const getLeagueRostersForCsvExport = async (
  leagueId: number
): Promise<string[]> => {
  console.log(
    `[SERVICE AUCTION_LEAGUE] Preparing CSV export data for league ${leagueId}`
  );
  const csvRows: string[] = [];

  try {
    // 1. Recupera tutti i partecipanti della lega, con il nome del loro team e username
    //    Ordiniamo per manager_team_name o username per un output CSV consistente.
    const participantsStmt = db.prepare(`
      SELECT 
        lp.user_id,
        COALESCE(lp.manager_team_name, u.username, u.id) AS effective_team_name, -- Fallback chain per il nome del team
        u.username AS user_username -- Mantenuto per possibile uso o logging
      FROM league_participants lp
      JOIN users u ON lp.user_id = u.id
      WHERE lp.league_id = ?
      ORDER BY effective_team_name ASC 
    `);
    const participants = participantsStmt.all(leagueId) as {
      user_id: string;
      effective_team_name: string;
      user_username: string | null;
    }[];

    if (participants.length === 0) {
      console.log(
        `[SERVICE AUCTION_LEAGUE] No participants found for league ${leagueId}. CSV will be empty.`
      );
      return [];
    }

    // 2. Prepara lo statement per recuperare i giocatori assegnati a un manager
    const rosterForManagerStmt = db.prepare(`
      SELECT
        p.id AS player_id,
        pa.purchase_price,
        p.role, -- Per l'ordinamento
        p.name  -- Per l'ordinamento
      FROM player_assignments pa
      JOIN players p ON pa.player_id = p.id
      WHERE pa.auction_league_id = @leagueId AND pa.user_id = @managerUserId
      ORDER BY 
        CASE p.role
          WHEN 'P' THEN 1
          WHEN 'D' THEN 2
          WHEN 'C' THEN 3
          WHEN 'A' THEN 4
          ELSE 5
        END,
        p.name ASC
    `);

    // 3. Itera su ogni partecipante per costruire le righe CSV
    for (let i = 0; i < participants.length; i++) {
      const participant = participants[i];
      const managerTeamName = participant.effective_team_name; // Usa il nome del team effettivo

      console.log(
        `[SERVICE AUCTION_LEAGUE] Processing roster for manager: ${managerTeamName} (User ID: ${participant.user_id})`
      );

      const rosterPlayers = rosterForManagerStmt.all({
        leagueId: leagueId,
        managerUserId: participant.user_id,
      }) as RosterPlayerForExport[];

      if (rosterPlayers.length > 0) {
        rosterPlayers.forEach((player) => {
          // Formato riga: NomeSquadraManager,IDGiocatore,CostoAcquisto
          // Assicurati che managerTeamName non contenga virgole o racchiudilo tra virgolette se necessario.
          // Per semplicità, ora non gestiamo l'escaping CSV complesso.
          const csvRow = `${managerTeamName},${player.player_id},${player.purchase_price}`;
          csvRows.push(csvRow);
        });
      } else {
        // Se un manager non ha giocatori, potremmo voler comunque includere il suo nome squadra
        // seguito da nessuna riga giocatore, o una riga placeholder.
        // Per ora, se non ha giocatori, non aggiungiamo righe per lui,
        // ma il separatore $,$,$ verrà aggiunto dopo (se non è l'ultimo).
        // Potremmo aggiungere una riga vuota con il nome squadra per rappresentarlo:
        // csvRows.push(`${managerTeamName},,`); // Esempio: NomeSquadra,,
        console.log(
          `[SERVICE AUCTION_LEAGUE] Manager ${managerTeamName} has no players in roster.`
        );
      }

      // Aggiungi il separatore `$,$,$` se non è l'ultimo partecipante
      // E se il partecipante corrente (o quelli precedenti) avevano giocatori.
      // Questo evita un separatore alla fine del file o separatori doppi se team intermedi sono vuoti.
      if (i < participants.length - 1) {
        // Aggiungiamo il separatore solo se questo team aveva giocatori O se il CSV non è vuoto
        // per evitare separatori all'inizio se i primi team sono vuoti.
        // Una logica più semplice è aggiungerlo sempre tranne per l'ultimo,
        // e poi l'API handler potrebbe pulire eventuali separatori finali.
        // Per ora, lo aggiungiamo sempre tranne per l'ultimo.
        csvRows.push("$,$,$");
      }
    }

    // Rimuovi un eventuale separatore $,$,$ finale se l'ultimo team non aveva giocatori
    // o se l'array è solo [ '$,$,$' ]
    if (csvRows.length > 0 && csvRows[csvRows.length - 1] === "$,$,$") {
      csvRows.pop();
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

// 5.1. Tipi di dati per la dashboard
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

// 5.2. Funzione per recuperare i dettagli della lega per la dashboard admin
export async function getLeagueDetailsForAdminDashboard(
  leagueId: number
): Promise<LeagueDashboardDetails | null> {
  // 1. Recupera i dettagli principali della lega
  const league = db
    .prepare(
      `SELECT
        id,
        name,
        status,
        league_type as leagueType,
        initial_budget_per_manager as initialBudget,
        timer_duration_minutes as timerDurationMinutes,
        active_auction_roles as activeAuctionRoles
       FROM auction_leagues
       WHERE id = ?`
    )
    .get(leagueId) as Omit<LeagueDashboardDetails, "participants"> | undefined;

  if (!league) {
    return null; // La lega non è stata trovata
  }

  // 2. Recupera i partecipanti della lega, unendo la tabella utenti per ottenere il nome utente
  const participants = db
    .prepare(
      `SELECT
          lp.user_id as userId,
          u.username,
          lp.manager_team_name as teamName,
          lp.current_budget as currentBudget,
          lp.locked_credits as lockedCredits,
          lp.joined_at as joinedAt
       FROM league_participants lp
       JOIN users u ON lp.user_id = u.id
       WHERE lp.league_id = ?
       ORDER BY lp.joined_at ASC`
    )
    .all(leagueId) as LeagueParticipantDetails[];

  // 3. Combina i risultati e restituiscili
  return {
    ...league,
    participants,
  };
}

// 6. Funzione per aggiornare lo stato di una lega
export async function updateLeagueStatus(
  leagueId: number,
  newStatus: string
): Promise<{ success: boolean; message: string }> {
  // Qui potremmo aggiungere una logica di validazione complessa per assicurarsi
  // che le transizioni di stato siano valide (es. da 'setup' a 'completed' non è permesso).
  // Per ora, ci limitiamo ad aggiornare lo stato.

  try {
    const stmt = db.prepare(
      `UPDATE auction_leagues SET status = ? WHERE id = ?`
    );
    const result = stmt.run(newStatus, leagueId);

    if (result.changes === 0) {
      throw new Error(
        `Nessuna lega trovata con ID ${leagueId}, o lo stato è già '${newStatus}'.`
      );
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

// 7.1. Tipo di dati per la lista
export interface LeagueForAdminList {
  id: number;
  name: string;
  status: string;
  leagueType: string;
  participantCount: number;
}

// 7.2. Funzione per recuperare tutte le leghe per la vista admin
export async function getLeaguesForAdminList(): Promise<LeagueForAdminList[]> {
  try {
    const leagues = db
      .prepare(
        `
      SELECT
        al.id,
        al.name,
        al.status,
        al.league_type as leagueType,
        (SELECT COUNT(*) FROM league_participants lp WHERE lp.league_id = al.id) as participantCount
      FROM
        auction_leagues al
      ORDER BY
        al.created_at DESC
    `
      )
      .all() as LeagueForAdminList[];

    return leagues;
  } catch (error) {
    console.error("Errore nel recuperare la lista delle leghe:", error);
    return []; // Ritorna un array vuoto in caso di errore
  }
}

// 9. Funzione per Modificare il Nome della Squadra di un Partecipante
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

    const stmt = db.prepare(
      `UPDATE league_participants SET manager_team_name = ? WHERE league_id = ? AND user_id = ?`
    );
    const result = stmt.run(newTeamName, leagueId, userId);

    if (result.changes === 0) {
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

// Funzione per ottenere tutti i dati dei manager per la pagina asta
interface LeagueSlots {
  slots_P: number;
  slots_D: number;
  slots_C: number;
  slots_A: number;
}
interface ActiveAuction {
  player_id: number;
  player_name: string;
  player_role: string;
  player_team: string;
  current_highest_bidder_id: string | null;
  current_highest_bid_amount: number;
  scheduled_end_time: number;
  status: string;
}
interface AutoBidIndicator {
  player_id: number;
  auto_bid_count: number;
}
interface PlayerInRoster {
  id: number;
  name: string;
  role: string;
  team: string;
  assignment_price: number;
}
interface AssignmentQueryResult extends PlayerInRoster {
  user_id: string;
}
interface Manager {
  user_id: string;
  manager_team_name: string;
  current_budget: number;
  locked_credits: number;
  total_budget: number;
  firstName?: string;
  lastName?: string;
  players: PlayerInRoster[];
}

export async function getLeagueManagersAndData(leagueId: number): Promise<{
  managers: Manager[];
  leagueSlots: LeagueSlots | null;
  activeAuctions: ActiveAuction[];
  autoBids: AutoBidIndicator[];
}> {
  // 1. Get league slots
  const leagueSlotsStmt = db.prepare(
    `SELECT slots_P, slots_D, slots_C, slots_A FROM auction_leagues WHERE id = ?`
  );
  const leagueSlots = leagueSlotsStmt.get(leagueId) as LeagueSlots | null;

  // 2. Get all participants
  const participants = await getLeagueParticipants(leagueId);

  // 3. Get all player assignments for the league in one go
  const assignmentsStmt = db.prepare(`
    SELECT pa.user_id, p.id, p.name, p.role, p.team, pa.purchase_price as assignment_price
    FROM player_assignments pa
    JOIN players p ON pa.player_id = p.id
    WHERE pa.auction_league_id = ?
  `);
  const allAssignments = assignmentsStmt.all(leagueId) as AssignmentQueryResult[];
  
  const assignmentsByManager = allAssignments.reduce((acc, assignment) => {
    if (!acc[assignment.user_id]) {
      acc[assignment.user_id] = [];
    }
    acc[assignment.user_id].push(assignment);
    return acc;
  }, {} as Record<string, AssignmentQueryResult[]>);

  // 4. Map participants to the final Manager structure
  const managers: Manager[] = participants.map(p => ({
    user_id: p.user_id,
    manager_team_name: p.manager_team_name || 'N/A',
    current_budget: p.current_budget,
    locked_credits: p.locked_credits,
    total_budget: p.current_budget + p.locked_credits,
    firstName: p.user_full_name?.split(' ')[0],
    lastName: p.user_full_name?.split(' ')[1],
    players: assignmentsByManager[p.user_id] || [],
  }));

  // 5. Get all active auctions
  const activeAuctionsStmt = db.prepare(`
    SELECT 
      a.player_id,
      p.name as player_name,
      p.role as player_role,
      p.team as player_team,
      a.current_highest_bidder_id,
      a.current_highest_bid as current_highest_bid_amount,
      a.scheduled_end_time,
      a.status
    FROM auctions a
    JOIN players p ON a.player_id = p.id
    WHERE a.auction_league_id = ? AND a.status = 'active'
  `);
  const activeAuctions = activeAuctionsStmt.all(leagueId) as ActiveAuction[];

  // 6. Get all auto-bids
  const autoBidsStmt = db.prepare(`
    SELECT player_id, COUNT(*) as auto_bid_count
    FROM auto_bids
    WHERE auction_league_id = ? AND is_active = 1
    GROUP BY player_id
  `);
  const autoBids = autoBidsStmt.all(leagueId) as AutoBidIndicator[];

  return {
    managers,
    leagueSlots,
    activeAuctions,
    autoBids,
  };
}
