// src/lib/db/services/player.service.ts v.1.1
// Servizio per recuperare, filtrare e gestire i dati dei giocatori.
// 1. Importazioni
import { db } from "@/lib/db";

// 2. Tipi e Interfacce (Manteniamo quelle esistenti e aggiungiamo le nuove)
export interface Player {
  // Già definita, assicurati che sia completa
  id: number;
  role: string;
  role_mantra: string | null;
  name: string;
  team: string;
  current_quotation: number;
  initial_quotation: number;
  current_quotation_mantra: number | null;
  initial_quotation_mantra: number | null;
  fvm: number | null;
  fvm_mantra: number | null;
  photo_url?: string | null; // Aggiunto come opzionale
  last_updated_from_source?: number | null; // Aggiunto come opzionale
  created_at?: number; // Aggiunto come opzionale
  updated_at?: number; // Aggiunto come opzionale
}

export interface GetPlayersOptions {
  /* ... come prima ... */ name?: string;
  role?: string;
  team?: string;
  sortBy?: "name" | "role" | "team" | "current_quotation" | "fvm";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}
export interface GetPlayersResult {
  players: Player[];
  totalPlayers: number;
  page: number;
  limit: number;
  totalPages: number;
}

// NUOVI TIPI PER CRUD
export interface CreatePlayerData {
  // L'ID non è qui perché è AUTOINCREMENT, a meno che non lo si voglia specificare
  // Se l'ID viene dal file Excel e vuoi permettere l'inserimento manuale con ID specifico:
  id: number; // Rendiamolo opzionale per l'inserimento manuale, ma l'import Excel lo richiede
  role: "P" | "D" | "C" | "A";
  name: string;
  team: string;
  initial_quotation: number;
  current_quotation: number; // Spesso uguale a initial_quotation alla creazione manuale
  role_mantra?: string | null;
  current_quotation_mantra?: number | null;
  initial_quotation_mantra?: number | null;
  fvm?: number | null;
  fvm_mantra?: number | null;
  photo_url?: string | null;
}

export interface UpdatePlayerData {
  role?: "P" | "D" | "C" | "A";
  name?: string;
  team?: string;
  initial_quotation?: number;
  current_quotation?: number;
  role_mantra?: string | null;
  current_quotation_mantra?: number | null;
  initial_quotation_mantra?: number | null;
  fvm?: number | null;
  fvm_mantra?: number | null;
  photo_url?: string | null;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// 3. Funzione GetPlayers (INVARIATA - come nella v.1.0)
export const getPlayers = async (
  options: GetPlayersOptions = {}
): Promise<GetPlayersResult> => {
  // ... implementazione completa di getPlayers come fornita precedentemente ...
  // Per brevità, la collasso qui, ma deve essere presente nel tuo file.
  // COLLAPSED getPlayers CODE - Use v.1.0 implementation
  console.log("[SERVICE PLAYER] Getting players with options:", options);
  const {
    name,
    role,
    team,
    sortBy = "name",
    sortOrder = "asc",
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
  } = options;
  const validatedPage = Math.max(1, Number(page) || DEFAULT_PAGE);
  const validatedLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limit) || DEFAULT_LIMIT)
  );
  const offset = (validatedPage - 1) * validatedLimit;
  let baseQuery = "SELECT * FROM players";
  let countQuery = "SELECT COUNT(*) as total FROM players";
  const whereClauses: string[] = [];
  const queryParams: (string | number)[] = [];
  const countQueryParams: (string | number)[] = [];
  if (name) {
    whereClauses.push("name LIKE ?");
    const searchName = `%${name}%`;
    queryParams.push(searchName);
    countQueryParams.push(searchName);
  }
  if (role) {
    whereClauses.push("role = ?");
    queryParams.push(role.toUpperCase());
    countQueryParams.push(role.toUpperCase());
  }
  if (team) {
    whereClauses.push("team LIKE ?");
    const searchTeam = `%${team}%`;
    queryParams.push(searchTeam);
    countQueryParams.push(searchTeam);
  }
  if (whereClauses.length > 0) {
    const whereString = " WHERE " + whereClauses.join(" AND ");
    baseQuery += whereString;
    countQuery += whereString;
  }
  const validSortByFields: { [key: string]: string } = {
    name: "name",
    role: "role",
    team: "team",
    current_quotation: "current_quotation",
    fvm: "fvm",
  };
  const dbSortByField = validSortByFields[sortBy] || "name";
  const dbSortOrder = sortOrder === "desc" ? "DESC" : "ASC";
  baseQuery += ` ORDER BY ${dbSortByField} ${dbSortOrder}, id ${dbSortOrder}`;
  baseQuery += ` LIMIT ? OFFSET ?`;
  queryParams.push(validatedLimit, offset);
  try {
    const playersStmt = db.prepare(baseQuery);
    const players = playersStmt.all(...queryParams) as Player[];
    const totalPlayersStmt = db.prepare(countQuery);
    const totalResult = totalPlayersStmt.get(...countQueryParams) as {
      total: number;
    };
    const totalPlayers = totalResult.total;
    const totalPages = Math.ceil(totalPlayers / validatedLimit);
    return {
      players,
      totalPlayers,
      page: validatedPage,
      limit: validatedLimit,
      totalPages,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown database error.";
    console.error(
      "[SERVICE PLAYER] Error fetching players:",
      errorMessage,
      error
    );
    throw new Error(`Failed to retrieve players: ${errorMessage}`);
  }
  // END COLLAPSED getPlayers CODE
};

// 4. NUOVE Funzioni CRUD per Giocatori

/**
 * Crea un nuovo giocatore nel database.
 * Se l'ID è fornito e già esistente, l'operazione fallirà a causa del constraint UNIQUE (o PRIMARY KEY).
 * Per l'inserimento manuale, l'ID potrebbe essere omesso per auto-incremento,
 * ma per coerenza con l'import Excel, permettiamo di specificarlo.
 */
export const createPlayer = (playerData: CreatePlayerData): Player => {
  console.log("[SERVICE PLAYER] Creating new player:", playerData);
  const now = Math.floor(Date.now() / 1000);

  // Se l'ID non è fornito, SQLite lo auto-incrementerà (se la colonna id è INTEGER PRIMARY KEY AUTOINCREMENT)
  // Se l'ID è fornito, verrà usato quello.
  const sql = `
    INSERT INTO players (
      id, role, name, team, initial_quotation, current_quotation,
      role_mantra, current_quotation_mantra, initial_quotation_mantra,
      fvm, fvm_mantra, photo_url, 
      last_updated_from_source, created_at, updated_at
    ) VALUES (
      @id, @role, @name, @team, @initial_quotation, @current_quotation,
      @role_mantra, @current_quotation_mantra, @initial_quotation_mantra,
      @fvm, @fvm_mantra, @photo_url,
      @last_updated_from_source, @created_at, @updated_at
    ) RETURNING *; 
  `;
  // Nota: RETURNING * funziona bene con .get() o .all() in better-sqlite3 per INSERT

  try {
    const stmt = db.prepare(sql);
    const newPlayer = stmt.get({
      id: playerData.id, // Se playerData.id è undefined, SQLite userà AUTOINCREMENT (se configurato) o darà errore se PK e non fornito
      role: playerData.role,
      name: playerData.name, // Assumiamo già sanificato se necessario
      team: playerData.team,
      initial_quotation: playerData.initial_quotation,
      current_quotation: playerData.current_quotation,
      role_mantra: playerData.role_mantra ?? null,
      current_quotation_mantra: playerData.current_quotation_mantra ?? null,
      initial_quotation_mantra: playerData.initial_quotation_mantra ?? null,
      fvm: playerData.fvm ?? null,
      fvm_mantra: playerData.fvm_mantra ?? null,
      photo_url: playerData.photo_url ?? null,
      last_updated_from_source: now,
      created_at: now,
      updated_at: now,
    }) as Player | undefined;

    if (!newPlayer) {
      // Questo caso è improbabile con RETURNING * se l'insert ha successo,
      // ma un errore DB avrebbe già lanciato un'eccezione.
      throw new Error("Failed to create player or retrieve data after insert.");
    }
    console.log(
      "[SERVICE PLAYER] Player created successfully with ID:",
      newPlayer.id
    );
    return newPlayer;
  } catch (error: any) {
    console.error(
      "[SERVICE PLAYER] Error creating player:",
      error.message,
      error
    );
    if (
      error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      error.message.includes("UNIQUE constraint failed: players.id")
    ) {
      throw new Error(`Player with ID ${playerData.id} already exists.`);
    }
    throw new Error(`Failed to create player: ${error.message}`);
  }
};

/**
 * Aggiorna un giocatore esistente nel database.
 */
export const updatePlayer = (
  playerId: number,
  playerData: UpdatePlayerData
): Player | null => {
  console.log(
    `[SERVICE PLAYER] Updating player ID ${playerId} with data:`,
    playerData
  );
  const now = Math.floor(Date.now() / 1000);

  const setClauses: string[] = [];
  const params: any = { id: playerId, updated_at: now };

  // Costruisci dinamicamente la parte SET della query
  Object.keys(playerData).forEach((keyStr) => {
    const key = keyStr as keyof UpdatePlayerData;
    if (playerData[key] !== undefined) {
      // Solo se il campo è presente nei dati di update
      setClauses.push(`${key} = @${key}`);
      params[key] =
        playerData[key] === "" && ["role_mantra", "photo_url"].includes(key)
          ? null
          : playerData[key]; // Gestisci stringhe vuote per campi nullable
    }
  });

  if (setClauses.length === 0) {
    console.warn(
      "[SERVICE PLAYER] No fields provided for update for player ID:",
      playerId
    );
    // Potresti restituire il giocatore esistente o un errore/messaggio specifico
    const existingPlayer = db
      .prepare("SELECT * FROM players WHERE id = ?")
      .get(playerId) as Player | undefined;
    return existingPlayer || null;
  }

  const sql = `
    UPDATE players
    SET ${setClauses.join(", ")}, updated_at = @updated_at
    WHERE id = @id
    RETURNING *;
  `;

  try {
    const stmt = db.prepare(sql);
    const updatedPlayer = stmt.get(params) as Player | undefined;

    if (!updatedPlayer) {
      // Questo potrebbe accadere se l'ID giocatore non esiste, .get() non troverebbe nulla.
      // La clausola RETURNING * non restituirebbe nulla se nessuna riga viene aggiornata.
      console.warn(
        `[SERVICE PLAYER] Player with ID ${playerId} not found for update, or no actual changes made.`
      );
      return null;
    }
    console.log("[SERVICE PLAYER] Player updated successfully:", updatedPlayer);
    return updatedPlayer;
  } catch (error: any) {
    console.error(
      `[SERVICE PLAYER] Error updating player ID ${playerId}:`,
      error.message,
      error
    );
    throw new Error(`Failed to update player: ${error.message}`);
  }
};

/**
 * Elimina un giocatore dal database.
 * ATTENZIONE: Considerare le implicazioni se il giocatore è già in aste o assegnato.
 * Per ora, implementazione semplice di DELETE.
 */
export const deletePlayer = (
  playerId: number
): { success: boolean; message?: string } => {
  console.log(`[SERVICE PLAYER] Deleting player ID ${playerId}`);

  // TODO: Aggiungere controlli prima di eliminare?
  // - Il giocatore è in qualche asta attiva?
  // - Il giocatore è assegnato a qualche squadra?
  // Se sì, l'eliminazione potrebbe fallire a causa di Foreign Key Constraints (ON DELETE RESTRICT)
  // o causare inconsistenza se ON DELETE SET NULL/CASCADE non è desiderato ovunque.
  // Il tuo schema usa ON DELETE CASCADE per auctions->players e player_assignments->players,
  // quindi eliminare un giocatore cancellerà anche le sue aste e assegnazioni. Valuta se è il comportamento desiderato.

  try {
    const stmt = db.prepare("DELETE FROM players WHERE id = ?");
    const result = stmt.run(playerId);

    if (result.changes > 0) {
      console.log(
        `[SERVICE PLAYER] Player ID ${playerId} deleted successfully.`
      );
      return { success: true, message: "Player deleted successfully." };
    } else {
      console.warn(
        `[SERVICE PLAYER] Player ID ${playerId} not found for deletion.`
      );
      return {
        success: false,
        message: "Player not found or already deleted.",
      };
    }
  } catch (error: any) {
    console.error(
      `[SERVICE PLAYER] Error deleting player ID ${playerId}:`,
      error.message,
      error
    );
    if (error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      throw new Error(
        `Failed to delete player ID ${playerId}: It is still referenced in other tables (e.g., active auctions, assignments). Please resolve these dependencies first.`
      );
    }
    throw new Error(`Failed to delete player: ${error.message}`);
  }
};
