// src/lib/services/auction-league.service.ts
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
 * Ottiene tutte le leghe create da un specifico admin.
 */
export const getAuctionLeaguesByAdmin = async (
  adminUserId: string
): Promise<AuctionLeague[]> => {
  // TODO: Implementazione
  console.log(`getAuctionLeaguesByAdmin called for: ${adminUserId}`);
  // Esempio di implementazione:
  // try {
  //   const stmt = db.prepare("SELECT * FROM auction_leagues WHERE admin_creator_id = ? ORDER BY created_at DESC");
  //   const leagues = stmt.all(adminUserId) as AuctionLeague[];
  //   return leagues;
  // } catch (error) {
  //   console.error(`Error in getAuctionLeaguesByAdmin: ${error}`);
  //   throw new Error("Failed to retrieve leagues for admin.");
  // }
  throw new Error("Not implemented");
};

/**
 * Ottiene una singola lega d'asta tramite il suo ID.
 * Accessibile dall'admin creatore o da partecipanti.
 */
export const getAuctionLeagueById = async (
  leagueId: number
  // userId?: string // Potremmo passare l'ID utente per controlli di permesso futuri
): Promise<AuctionLeague | null> => {
  // TODO: Implementazione
  console.log(`getAuctionLeagueById called for: ${leagueId}`);
  // Esempio di implementazione:
  // try {
  //   const stmt = db.prepare("SELECT * FROM auction_leagues WHERE id = ?");
  //   const league = stmt.get(leagueId) as AuctionLeague | undefined;
  //   return league || null;
  // } catch (error) {
  //   console.error(`Error in getAuctionLeagueById: ${error}`);
  //   throw new Error("Failed to retrieve league by ID.");
  // }
  throw new Error("Not implemented");
};

/**
 * Aggiorna una lega d'asta esistente.
 * Solo l'admin creatore può farlo.
 * Applicare logica per campi modificabili in base allo status della lega.
 */
export const updateAuctionLeague = async (
  leagueId: number,
  data: UpdateAuctionLeagueData,
  adminUserId: string
): Promise<AuctionLeague> => {
  // TODO: Implementazione
  console.log(
    `updateAuctionLeague called for: ${leagueId} with data: ${JSON.stringify(data)} by admin: ${adminUserId}`
  );
  throw new Error("Not implemented");
};

// --- Gestione Partecipanti Lega ---

/**
 * Aggiunge un utente (manager) a una lega d'asta.
 * Solo l'admin creatore della lega può farlo.
 */
export const addParticipantToLeague = async (
  leagueId: number,
  userIdToAdd: string,
  adminUserId: string // Per verificare i permessi dell'admin che esegue l'azione
): Promise<LeagueParticipant> => {
  // TODO: Implementazione
  console.log(
    `addParticipantToLeague called for league: ${leagueId}, user to add: ${userIdToAdd}, by admin: ${adminUserId}`
  );
  throw new Error("Not implemented");
};

/**
 * Rimuove un partecipante da una lega d'asta.
 * Solo l'admin creatore della lega può farlo.
 */
export const removeParticipantFromLeague = async (
  leagueId: number,
  userIdToRemove: string,
  adminUserId: string // Per verificare i permessi
): Promise<{ success: boolean; message?: string }> => {
  // TODO: Implementazione
  console.log(
    `removeParticipantFromLeague called for league: ${leagueId}, user to remove: ${userIdToRemove}, by admin: ${adminUserId}`
  );
  throw new Error("Not implemented");
};

/**
 * Ottiene tutti i partecipanti di una lega d'asta.
 */
export const getLeagueParticipants = async (
  leagueId: number
): Promise<LeagueParticipant[]> => {
  // TODO: Implementazione
  console.log(`getLeagueParticipants called for league: ${leagueId}`);
  throw new Error("Not implemented");
};
