// src/lib/db/services/player.service.ts v.2.0 (Async Turso Migration)
// Servizio per recuperare, filtrare e gestire i dati dei giocatori.
// 1. Importazioni
import { db } from "@/lib/db";

// 2. Tipi e Interfacce
export interface Player {
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
  photo_url?: string | null;
  last_updated_from_source?: number | null;
  created_at?: number;
  updated_at?: number;
  auction_status?: "no_auction" | "active_auction" | "assigned";
  current_bid?: number;
  scheduled_end_time?: number; // Unix timestamp for auction end
}

export interface GetPlayersOptions {
  name?: string;
  role?: string;
  team?: string;
  sortBy?: "name" | "role" | "team" | "current_quotation" | "fvm";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  leagueId?: number;
  userId?: string;
}

export interface GetPlayersResult {
  players: Player[];
  totalPlayers: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ... (Create/Update interfaces omitted, assumed unchanged)

// ... (GetPlayersOptions and GetPlayersResult interfaces)

export interface CreatePlayerData {
  id: number;
  role: "P" | "D" | "C" | "A";
  name: string;
  team: string;
  initial_quotation: number;
  current_quotation: number;
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
const MAX_LIMIT = 1000;

// 3. Funzione GetPlayers (Versione Definitiva e Corretta)
export const getPlayers = async (
  options: GetPlayersOptions = {}
): Promise<GetPlayersResult> => {
  console.log("[SERVICE PLAYER] Getting players with options:", options);
  const {
    name,
    role,
    team,
    sortBy = "name",
    sortOrder = "asc",
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    leagueId,
    userId,
  } = options;

  const validatedPage = Math.max(1, Number(page) || DEFAULT_PAGE);
  const validatedLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limit) || DEFAULT_LIMIT)
  );
  const offset = (validatedPage - 1) * validatedLimit;

  let selectClause = "";
  const selectParams: (string | number)[] = [];
  let joinClause = "";
  const joinParams: (string | number)[] = [];

  if (leagueId) {
    if (userId) {
      // If we have both leagueId and userId, join preferences
      joinClause = `
        LEFT JOIN user_player_preferences upp
        ON p.id = upp.player_id AND upp.user_id = ? AND upp.league_id = ?
      `;
      joinParams.push(userId, leagueId);
    }

    selectClause = `
      SELECT
        p.*,
        CASE
          WHEN (SELECT 1 FROM player_assignments pa WHERE pa.player_id = p.id AND pa.auction_league_id = ?) THEN 'assigned'
          WHEN (SELECT 1 FROM auctions a WHERE a.player_id = p.id AND a.auction_league_id = ? AND a.status = 'active') THEN 'active_auction'
          ELSE 'no_auction'
        END as auction_status,
        (SELECT current_highest_bid_amount FROM auctions a WHERE a.player_id = p.id AND a.auction_league_id = ? AND a.status = 'active') as current_bid,
        (SELECT scheduled_end_time FROM auctions a WHERE a.player_id = p.id AND a.auction_league_id = ? AND a.status = 'active') as scheduled_end_time,
        COALESCE(upp.is_starter, p.is_starter) as computed_is_starter,
        COALESCE(upp.is_favorite, p.is_favorite) as computed_is_favorite,
        COALESCE(upp.integrity_value, p.integrity_value) as computed_integrity_value,
        COALESCE(upp.has_fmv, p.has_fmv) as computed_has_fmv
    `;
    selectParams.push(leagueId, leagueId, leagueId, leagueId);
  } else {
    selectClause = "SELECT p.*, 'no_auction' as auction_status, NULL as current_bid, p.is_starter as computed_is_starter, p.is_favorite as computed_is_favorite, p.integrity_value as computed_integrity_value, p.has_fmv as computed_has_fmv";
  }

  const fromClause = "FROM players p";
  const whereClauses: string[] = [];
  const filterParams: (string | number)[] = [];


  if (name) {
    whereClauses.push("p.name LIKE ?");
    filterParams.push(`%${name}%`);
  }
  if (role) {
    whereClauses.push("p.role = ?");
    filterParams.push(role.toUpperCase());
  }
  if (team) {
    whereClauses.push("p.team LIKE ?");
    filterParams.push(`%${team}%`);
  }

  const whereString =
    whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*) as total ${fromClause}${whereString}`;

  const validSortByFields: { [key: string]: string } = {
    name: "p.name",
    role: "p.role",
    team: "p.team",
    current_quotation: "p.current_quotation",
    fvm: "p.fvm",
  };
  const dbSortByField = validSortByFields[sortBy] || "p.name";
  const dbSortOrder = sortOrder === "desc" ? "DESC" : "ASC";
  const orderByClause = ` ORDER BY ${dbSortByField} ${dbSortOrder}, p.id ${dbSortOrder}`;

  const limitOffsetClause = ` LIMIT ? OFFSET ?`;

  const baseQuery = `${selectClause} ${fromClause} ${joinClause} ${whereString}${orderByClause}${limitOffsetClause}`;

  const finalBaseParams = [
    ...selectParams,
    ...joinParams,
    ...filterParams,
    validatedLimit,
    offset,
  ];
  const finalCountParams = [...filterParams];

  try {
    const totalResult = await db.execute({
      sql: countQuery,
      args: finalCountParams,
    });
    const totalPlayers = Number(totalResult.rows[0].total);

    const playersResult = await db.execute({
      sql: baseQuery,
      args: finalBaseParams,
    });
    const players = playersResult.rows as unknown as Player[];

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
      `[SERVICE PLAYER] Error fetching players. Query: "${baseQuery}", Params: ${JSON.stringify(finalBaseParams)}`,
      errorMessage,
      error
    );
    throw new Error(`Failed to retrieve players: ${errorMessage}`);
  }
};

// 4. Funzioni CRUD per Giocatori (invariate)
export const createPlayer = async (
  playerData: CreatePlayerData
): Promise<Player> => {
  console.log("[SERVICE PLAYER] Creating new player:", playerData);
  const now = Math.floor(Date.now() / 1000);

  const sql = `
    INSERT INTO players (
      id, role, name, team, initial_quotation, current_quotation,
      role_mantra, current_quotation_mantra, initial_quotation_mantra,
      fvm, fvm_mantra, photo_url,
      last_updated_from_source, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    ) RETURNING *;
  `;

  try {
    const result = await db.execute({
      sql,
      args: [
        playerData.id,
        playerData.role,
        playerData.name,
        playerData.team,
        playerData.initial_quotation,
        playerData.current_quotation,
        playerData.role_mantra ?? null,
        playerData.current_quotation_mantra ?? null,
        playerData.initial_quotation_mantra ?? null,
        playerData.fvm ?? null,
        playerData.fvm_mantra ?? null,
        playerData.photo_url ?? null,
        now,
        now,
        now,
      ],
    });

    const newPlayer = result.rows[0] as unknown as Player | undefined;

    if (!newPlayer) {
      throw new Error("Failed to create player or retrieve data after insert.");
    }
    console.log(
      "[SERVICE PLAYER] Player created successfully with ID:",
      newPlayer.id
    );
    return newPlayer;
  } catch (error: unknown) {
    console.error(
      "[SERVICE PLAYER] Error creating player:",
      error instanceof Error ? error.message : "Unknown error",
      error
    );
    if (
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") ||
      (error instanceof Error &&
        error.message.includes("UNIQUE constraint failed: players.id"))
    ) {
      throw new Error(`Player with ID ${playerData.id} already exists.`);
    }
    throw new Error(
      `Failed to create player: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export const updatePlayer = async (
  playerId: number,
  playerData: UpdatePlayerData
): Promise<Player | null> => {
  console.log(
    `[SERVICE PLAYER] Updating player ID ${playerId} with data:`,
    playerData
  );
  const now = Math.floor(Date.now() / 1000);

  const setClauses: string[] = [];
  const args: (string | number | null)[] = [];

  Object.keys(playerData).forEach((keyStr) => {
    const key = keyStr as keyof UpdatePlayerData;
    if (playerData[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      if (typeof playerData[key] === "boolean") {
        args.push(playerData[key] ? 1 : 0);
      } else if (
        playerData[key] === "" &&
        ["role_mantra", "photo_url"].includes(key)
      ) {
        args.push(null);
      } else {
        args.push(playerData[key] as string | number | null);
      }
    }
  });

  if (setClauses.length === 0) {
    console.warn(
      "[SERVICE PLAYER] No fields provided for update for player ID:",
      playerId
    );
    const existingPlayerResult = await db.execute({
      sql: "SELECT * FROM players WHERE id = ?",
      args: [playerId],
    });
    return (existingPlayerResult.rows[0] as unknown as Player) || null;
  }

  args.push(now);
  args.push(playerId);

  const sql = `
    UPDATE players
    SET ${setClauses.join(", ")}, updated_at = ?
    WHERE id = ?
    RETURNING *;
  `;

  try {
    const result = await db.execute({ sql, args });
    const updatedPlayer = result.rows[0] as unknown as Player | undefined;

    if (!updatedPlayer) {
      console.warn(
        `[SERVICE PLAYER] Player with ID ${playerId} not found for update, or no actual changes made.`
      );
      return null;
    }
    console.log("[SERVICE PLAYER] Player updated successfully:", updatedPlayer);
    return updatedPlayer;
  } catch (error: unknown) {
    console.error(
      `[SERVICE PLAYER] Error updating player ID ${playerId}:`,
      error instanceof Error ? error.message : "Unknown error",
      error
    );
    throw new Error(
      `Failed to update player: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};

export const deletePlayer = async (
  playerId: number
): Promise<{ success: boolean; message?: string }> => {
  console.log(`[SERVICE PLAYER] Deleting player ID ${playerId}`);

  try {
    const result = await db.execute({
      sql: "DELETE FROM players WHERE id = ?",
      args: [playerId],
    });

    if (result.rowsAffected > 0) {
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
  } catch (error: unknown) {
    console.error(
      `[SERVICE PLAYER] Error deleting player ID ${playerId}:`,
      error instanceof Error ? error.message : "Unknown error",
      error
    );
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "SQLITE_CONSTRAINT_FOREIGNKEY"
    ) {
      throw new Error(
        `Failed to delete player ID ${playerId}: It is still referenced in other tables (e.g., active auctions, assignments). Please resolve these dependencies first.`
      );
    }
    throw new Error(
      `Failed to delete player: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};
