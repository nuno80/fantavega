// src/lib/services/auction-league.service.ts
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
  players_P_acquired: number;
  players_D_acquired: number;
  players_C_acquired: number;
  players_A_acquired: number;
  total_players_acquired: number; // Campo generato dalla DB
  joined_at: number; // Timestamp Unix
  user_username?: string; // Opzionale, per JOIN con users
  user_full_name?: string; // Opzionale, per JOIN con users
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

export const addParticipantToLeague = async (
  leagueId: number,
  userIdToAdd: string,
  adminUserId: string // Per verificare i permessi dell'admin che esegue l'azione
): Promise<LeagueParticipant> => {
  console.log(
    `[SERVICE] addParticipantToLeague called for league ID: ${leagueId}, user to add: ${userIdToAdd}, by admin ID: ${adminUserId}`
  );

  // 1. Verificare che adminUserId sia l'admin della lega
  const league = await getAuctionLeagueByIdForAdmin(leagueId, adminUserId); // Riusa la funzione esistente
  if (!league) {
    throw new Error(
      "League not found or user is not authorized to manage this league's participants."
    );
  }

  // 2. Verificare che l'utente da aggiungere esista nella tabella 'users'
  const userToAddStmt = db.prepare(
    "SELECT id, username, full_name, role FROM users WHERE id = ?"
  );
  const userToAdd = userToAddStmt.get(userIdToAdd) as
    | { id: string; username?: string; full_name?: string; role: AppRole }
    | undefined;

  if (!userToAdd) {
    throw new Error(`User with ID ${userIdToAdd} not found.`);
  }
  // Potresti voler aggiungere un controllo per assicurarti che solo utenti con ruolo 'manager' possano essere aggiunti
  if (userToAdd.role !== "manager") {
    throw new Error(
      `User ${userIdToAdd} is not a manager and cannot be added as a participant.`
    );
  }

  // 3. Verificare che l'utente non sia già partecipante in questa lega
  const existingParticipantStmt = db.prepare(
    "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?"
  );
  const existingParticipant = existingParticipantStmt.get(
    leagueId,
    userIdToAdd
  );

  if (existingParticipant) {
    throw new Error(
      `User ${userIdToAdd} is already a participant in league ${leagueId}.`
    );
  }

  // 4. Ottenere initial_budget_per_manager dalla lega (già fatto con 'league' sopra)
  const initialBudget = league.initial_budget_per_manager;
  const now = Math.floor(Date.now() / 1000);

  // 5. Inserire in league_participants
  try {
    const insertStmt = db.prepare(
      `INSERT INTO league_participants (
        league_id, user_id, current_budget, locked_credits,
        players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired,
        joined_at
      ) VALUES (
        @league_id, @user_id, @current_budget, 0,
        0, 0, 0, 0,
        @joined_at
      ) RETURNING *` // Usiamo RETURNING * per ottenere la riga inserita
    );

    const newParticipant = insertStmt.get({
      league_id: leagueId,
      user_id: userIdToAdd,
      current_budget: initialBudget,
      joined_at: now,
    }) as LeagueParticipant | undefined; // LeagueParticipant dovrebbe includere i campi players_X_acquired

    if (!newParticipant) {
      throw new Error(
        "Failed to add participant or retrieve their data after insert."
      );
    }

    console.log("[SERVICE] Participant added successfully:", newParticipant);
    return newParticipant;
  } catch (error) {
    console.error(
      `[SERVICE] Error adding participant ${userIdToAdd} to league ${leagueId}:`,
      error
    );
    // Gestire errori specifici del DB, es. violazione UNIQUE (anche se già controllato sopra)
    throw new Error("Failed to add participant to league.");
  }
};

/**
 * Ottiene tutti i partecipanti di una lega d'asta, includendo alcuni dettagli dell'utente.
 */
export const getLeagueParticipants = async (
  leagueId: number
  // Potremmo aggiungere adminUserId se solo l'admin può vedere tutti i partecipanti
  // o se un partecipante può vedere solo sé stesso o info limitate.
  // Per ora, assumiamo che sia una funzione accessibile (es. dall'admin o da chiunque veda la lega).
): Promise<LeagueParticipant[]> => {
  // LeagueParticipant dovrebbe essere estesa o modificata per includere user details
  console.log(
    `[SERVICE] getLeagueParticipants called for league ID: ${leagueId}`
  );
  try {
    // Query con JOIN per prendere anche username e full_name dalla tabella users
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
    // Estendi l'interfaccia LeagueParticipant se necessario per includere user_username, user_full_name, user_avatar_url
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

/**
 * Rimuove un partecipante da una lega d'asta.
 * Solo l'admin creatore della lega può farlo.
 * Considerazioni aggiuntive: cosa succede ai giocatori/offerte del partecipante rimosso?
 * Per ora, implementazione semplice di rimozione.
 */
export const removeParticipantFromLeague = async (
  leagueId: number,
  userIdToRemove: string,
  adminUserId: string // Per verificare i permessi
): Promise<{ success: boolean; message?: string }> => {
  console.log(
    `[SERVICE] removeParticipantFromLeague called for league ID: ${leagueId}, user to remove: ${userIdToRemove}, by admin ID: ${adminUserId}`
  );

  // 1. Verificare che adminUserId sia l'admin della lega
  const league = await getAuctionLeagueByIdForAdmin(leagueId, adminUserId);
  if (!league) {
    throw new Error(
      "League not found or user is not authorized to manage this league's participants."
    );
  }

  // 2. Verificare che il partecipante esista nella lega
  const participantStmt = db.prepare(
    "SELECT user_id FROM league_participants WHERE league_id = ? AND user_id = ?"
  );
  const participant = participantStmt.get(leagueId, userIdToRemove);

  if (!participant) {
    return {
      success: false,
      message: `User ${userIdToRemove} is not a participant in league ${leagueId}.`,
    };
  }

  // 3. Logica di validazione aggiuntiva (opzionale per ora):
  //    - La lega deve essere in uno stato 'setup' o 'participants_joining'?
  //    - Se il partecipante ha già giocatori o offerte attive, la rimozione è più complessa.
  //    Per ora, permettiamo la rimozione.
  if (league.status !== "setup" && league.status !== "participants_joining") {
    console.warn(
      `[SERVICE] Warning: Removing participant ${userIdToRemove} from league ${leagueId} which is in status '${league.status}'. This might have side effects.`
    );
    // Potresti voler lanciare un errore qui se non vuoi permetterlo:
    // throw new Error("Participants can only be removed when league status is 'setup' or 'participants_joining'.");
  }

  try {
    const deleteStmt = db.prepare(
      "DELETE FROM league_participants WHERE league_id = ? AND user_id = ?"
    );
    const result = deleteStmt.run(leagueId, userIdToRemove);

    if (result.changes > 0) {
      console.log(
        `[SERVICE] Participant ${userIdToRemove} removed successfully from league ${leagueId}.`
      );
      // TODO: Logica aggiuntiva?
      // - Annullare le offerte attive del partecipante?
      // - Svincolare i giocatori del partecipante? (Questo è complesso e dipende dalle regole)
      // - Registrare una transazione di budget se i crediti vengono restituiti?
      return {
        success: true,
        message: `Participant ${userIdToRemove} removed successfully.`,
      };
    } else {
      // Non dovrebbe accadere se il controllo precedente del partecipante è passato
      return {
        success: false,
        message: `Failed to remove participant ${userIdToRemove}. Participant not found or no changes made.`,
      };
    }
  } catch (error) {
    console.error(
      `[SERVICE] Error removing participant ${userIdToRemove} from league ${leagueId}:`,
      error
    );
    throw new Error("Failed to remove participant from league.");
  }
};
