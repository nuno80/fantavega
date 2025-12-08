/**
 * Servizio per l'importazione delle rose da CSV.
 * Gestisce il parsing, la validazione e l'import atomico delle rose
 * esportate dall'app ufficiale del Fantacalcio.
 */

import { db } from "@/lib/db";

// ============ TYPES ============

export interface ParsedRosterEntry {
  teamName: string;
  playerId: number;
  purchasePrice: number;
  lineNumber: number; // Per messaggi di errore dettagliati
}

export interface PlayerInfo {
  id: number;
  name: string;
  role: string;
}

export interface ParticipantInfo {
  user_id: string;
  manager_team_name: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  validEntries: ParsedRosterEntry[];
  summary: {
    totalEntries: number;
    validEntries: number;
    skippedEntries: number;
    teams: string[];
  };
}

export interface TeamImportSummary {
  team: string;
  players: number;
  totalSpent: number;
}

export interface ImportResult {
  success: boolean;
  teamsImported: number;
  playersImported: number;
  errors: string[];
  warnings: string[];
  summary: TeamImportSummary[];
}

// Tipo per la fonte del prezzo
export type PriceSource = "csv" | "database";

// ============ PARSING ============

/**
 * Analizza il contenuto CSV e restituisce le entry parsate.
 * Supporta sia TAB che virgola come delimitatori.
 */
export function parseCsvContent(content: string): ParsedRosterEntry[] {
  const entries: ParsedRosterEntry[] = [];
  const lines = content.trim().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Salta righe vuote
    if (!line) continue;

    // Salta separatori di squadra ($ $ $ o $,$,$ o similari)
    if (/^\$[\s,\t]*\$[\s,\t]*\$/.test(line)) continue;

    // Determina il delimitatore (tab o virgola)
    const delimiter = line.includes("\t") ? "\t" : ",";
    const parts = line.split(delimiter).map((p) => p.trim());

    if (parts.length < 3) {
      console.warn(
        `[ROSTER-IMPORT] Riga ${lineNumber}: formato non valido (${parts.length} colonne), skipping`
      );
      continue;
    }

    const [teamName, playerIdStr, priceStr] = parts;
    const playerId = parseInt(playerIdStr, 10);
    const purchasePrice = parseInt(priceStr, 10);

    if (!teamName || isNaN(playerId) || isNaN(purchasePrice)) {
      console.warn(
        `[ROSTER-IMPORT] Riga ${lineNumber}: dati non validi, skipping`
      );
      continue;
    }

    entries.push({
      teamName,
      playerId,
      purchasePrice,
      lineNumber,
    });
  }

  console.log(
    `[ROSTER-IMPORT] Parsing completato: ${entries.length} entry valide trovate`
  );
  return entries;
}

// ============ VALIDATION ============

/**
 * Valida i dati di import contro il database.
 * Verifica che i team esistano come partecipanti e che i giocatori esistano nel catalogo.
 */
export async function validateImportData(
  leagueId: number,
  entries: ParsedRosterEntry[]
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validEntries: ParsedRosterEntry[] = [];

  console.log(
    `[ROSTER-IMPORT] Validazione ${entries.length} entry per lega ${leagueId}`
  );

  // 1. Verifica stato della lega (deve essere 'participants_joining')
  const leagueResult = await db.execute({
    sql: "SELECT id, name, status, initial_budget_per_manager FROM auction_leagues WHERE id = ?",
    args: [leagueId],
  });

  if (leagueResult.rows.length === 0) {
    errors.push(`Lega con ID ${leagueId} non trovata`);
    return {
      isValid: false,
      errors,
      warnings,
      validEntries: [],
      summary: { totalEntries: 0, validEntries: 0, skippedEntries: 0, teams: [] },
    };
  }

  const league = leagueResult.rows[0] as unknown as {
    id: number;
    name: string;
    status: string;
    initial_budget_per_manager: number;
  };

  if (league.status !== "participants_joining") {
    errors.push(
      `L'import è possibile solo su leghe in stato "participants_joining". Stato attuale: "${league.status}"`
    );
    return {
      isValid: false,
      errors,
      warnings,
      validEntries: [],
      summary: { totalEntries: 0, validEntries: 0, skippedEntries: 0, teams: [] },
    };
  }

  // 2. Recupera i partecipanti della lega
  const participantsResult = await db.execute({
    sql: `
      SELECT user_id, COALESCE(manager_team_name, u.username, u.id) AS manager_team_name
      FROM league_participants lp
      JOIN users u ON lp.user_id = u.id
      WHERE lp.league_id = ?
    `,
    args: [leagueId],
  });

  const participants = participantsResult.rows as unknown as ParticipantInfo[];
  const teamNameToUserId = new Map<string, string>();

  // Crea mappa case-insensitive dei team name
  for (const p of participants) {
    teamNameToUserId.set(p.manager_team_name.toLowerCase(), p.user_id);
  }

  // 3. Recupera tutti i player IDs dal catalogo
  const uniquePlayerIds = [...new Set(entries.map((e) => e.playerId))];

  if (uniquePlayerIds.length === 0) {
    errors.push("Nessun giocatore trovato nel file CSV");
    return {
      isValid: false,
      errors,
      warnings,
      validEntries: [],
      summary: { totalEntries: 0, validEntries: 0, skippedEntries: 0, teams: [] },
    };
  }

  // Query batch per verificare quali player esistono
  const placeholders = uniquePlayerIds.map(() => "?").join(",");
  const playersResult = await db.execute({
    sql: `SELECT id, name, role FROM players WHERE id IN (${placeholders})`,
    args: uniquePlayerIds,
  });

  const existingPlayers = new Map<number, PlayerInfo>();
  for (const row of playersResult.rows) {
    const player = row as unknown as PlayerInfo;
    existingPlayers.set(player.id, player);
  }

  // 4. Valida ogni entry
  const teamsFound = new Set<string>();

  for (const entry of entries) {
    const teamNameLower = entry.teamName.toLowerCase();
    const userId = teamNameToUserId.get(teamNameLower);

    // Verifica che il team esista
    if (!userId) {
      errors.push(
        `Riga ${entry.lineNumber}: Team "${entry.teamName}" non trovato tra i partecipanti della lega`
      );
      continue;
    }

    // Verifica che il giocatore esista
    if (!existingPlayers.has(entry.playerId)) {
      warnings.push(
        `Riga ${entry.lineNumber}: Giocatore ID ${entry.playerId} non trovato nel catalogo, sarà saltato`
      );
      continue;
    }

    // Entry valida
    validEntries.push(entry);
    teamsFound.add(entry.teamName);
  }

  const result: ValidationResult = {
    isValid: errors.length === 0 && validEntries.length > 0,
    errors,
    warnings,
    validEntries,
    summary: {
      totalEntries: entries.length,
      validEntries: validEntries.length,
      skippedEntries: entries.length - validEntries.length,
      teams: Array.from(teamsFound),
    },
  };

  console.log(
    `[ROSTER-IMPORT] Validazione completata: ${validEntries.length}/${entries.length} entry valide, ${errors.length} errori, ${warnings.length} warnings`
  );

  return result;
}

// ============ IMPORT ============

/**
 * Esegue l'import atomico delle rose nella lega.
 * Elimina le assegnazioni esistenti e inserisce quelle nuove.
 * Aggiorna budget e contatori per ogni partecipante.
 * @param priceSource - 'csv' usa il prezzo dal file CSV, 'database' usa la quotazione attuale dal DB
 */
export async function importRostersToLeague(
  leagueId: number,
  entries: ParsedRosterEntry[],
  priceSource: PriceSource = "csv"
): Promise<ImportResult> {
  const _warnings: string[] = [];
  const summary: TeamImportSummary[] = [];

  console.log(
    `[ROSTER-IMPORT] Inizio import ${entries.length} entry per lega ${leagueId} (priceSource: ${priceSource})`
  );

  // Prima esegui la validazione
  const validation = await validateImportData(leagueId, entries);

  if (!validation.isValid) {
    return {
      success: false,
      teamsImported: 0,
      playersImported: 0,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: [],
    };
  }

  // Recupera dati necessari per l'import
  const leagueResult = await db.execute({
    sql: "SELECT initial_budget_per_manager FROM auction_leagues WHERE id = ?",
    args: [leagueId],
  });
  const initialBudget = (leagueResult.rows[0] as unknown as { initial_budget_per_manager: number })
    .initial_budget_per_manager;

  const participantsResult = await db.execute({
    sql: `
      SELECT user_id, COALESCE(manager_team_name, u.username, u.id) AS manager_team_name
      FROM league_participants lp
      JOIN users u ON lp.user_id = u.id
      WHERE lp.league_id = ?
    `,
    args: [leagueId],
  });
  const participants = participantsResult.rows as unknown as ParticipantInfo[];
  const teamNameToUserId = new Map<string, string>();
  for (const p of participants) {
    teamNameToUserId.set(p.manager_team_name.toLowerCase(), p.user_id);
  }

  // Recupera ruoli e quotazioni dei giocatori
  const playerIds = [...new Set(validation.validEntries.map((e) => e.playerId))];
  const placeholders = playerIds.map(() => "?").join(",");
  const playersResult = await db.execute({
    sql: `SELECT id, role, current_quotation FROM players WHERE id IN (${placeholders})`,
    args: playerIds,
  });
  const playerRoles = new Map<number, string>();
  const playerQuotations = new Map<number, number>();
  for (const row of playersResult.rows) {
    const player = row as unknown as { id: number; role: string; current_quotation: number };
    playerRoles.set(player.id, player.role);
    playerQuotations.set(player.id, player.current_quotation || 1); // Default a 1 se non presente
  }

  // Raggruppa entry per team
  const entriesByTeam = new Map<string, ParsedRosterEntry[]>();
  for (const entry of validation.validEntries) {
    const teamLower = entry.teamName.toLowerCase();
    if (!entriesByTeam.has(teamLower)) {
      entriesByTeam.set(teamLower, []);
    }
    entriesByTeam.get(teamLower)!.push(entry);
  }

  try {
    // Prepara tutte le query da eseguire in batch (transazione atomica)
    const batchStatements: { sql: string; args: (string | number | null)[] }[] = [];

    // 1. Elimina assegnazioni esistenti per questa lega
    batchStatements.push({
      sql: "DELETE FROM player_assignments WHERE auction_league_id = ?",
      args: [leagueId],
    });

    // 2. Elimina transazioni budget esistenti (tranne initial_allocation)
    batchStatements.push({
      sql: `DELETE FROM budget_transactions
            WHERE auction_league_id = ? AND transaction_type != 'initial_allocation'`,
      args: [leagueId],
    });

    // 3. Reset tutti i partecipanti al budget iniziale e contatori a zero
    batchStatements.push({
      sql: `UPDATE league_participants
            SET current_budget = ?,
                locked_credits = 0,
                players_P_acquired = 0,
                players_D_acquired = 0,
                players_C_acquired = 0,
                players_A_acquired = 0
            WHERE league_id = ?`,
      args: [initialBudget, leagueId],
    });

    // 4. Per ogni team, prepara gli INSERT per giocatori
    let totalPlayersImported = 0;

    for (const [teamLower, teamEntries] of entriesByTeam) {
      const userId = teamNameToUserId.get(teamLower)!;
      const teamName = teamEntries[0].teamName;
      let totalSpent = 0;
      const roleCounters = { P: 0, D: 0, C: 0, A: 0 };

      for (const entry of teamEntries) {
        const role = playerRoles.get(entry.playerId);
        if (!role) continue;

        // Determina il prezzo da usare: CSV o quotazione DB
        const price = priceSource === "database"
          ? (playerQuotations.get(entry.playerId) || 1)
          : entry.purchasePrice;

        // Inserisci assegnazione
        batchStatements.push({
          sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price)
                VALUES (?, ?, ?, ?)`,
          args: [leagueId, entry.playerId, userId, price],
        });

        // Registra transazione budget
        batchStatements.push({
          sql: `INSERT INTO budget_transactions
                (auction_league_id, user_id, transaction_type, amount, related_player_id, description, balance_after_in_league)
                VALUES (?, ?, 'win_auction_debit', ?, ?, ?, ?)`,
          args: [
            leagueId,
            userId,
            -price,
            entry.playerId,
            `Import CSV: Giocatore ID ${entry.playerId} (${priceSource === "database" ? "quotazione DB" : "prezzo CSV"})`,
            initialBudget - totalSpent - price,
          ],
        });

        totalSpent += price;
        roleCounters[role as keyof typeof roleCounters]++;
        totalPlayersImported++;
      }

      // Aggiorna budget e contatori del partecipante
      batchStatements.push({
        sql: `UPDATE league_participants
              SET current_budget = ?,
                  players_P_acquired = ?,
                  players_D_acquired = ?,
                  players_C_acquired = ?,
                  players_A_acquired = ?
              WHERE league_id = ? AND user_id = ?`,
        args: [
          initialBudget - totalSpent,
          roleCounters.P,
          roleCounters.D,
          roleCounters.C,
          roleCounters.A,
          leagueId,
          userId,
        ],
      });

      summary.push({
        team: teamName,
        players: teamEntries.length,
        totalSpent,
      });
    }

    // Esegui tutte le query in batch (transazione atomica su Turso)
    console.log(`[ROSTER-IMPORT] Esecuzione batch di ${batchStatements.length} query...`);
    await db.batch(batchStatements, "write");

    console.log(
      `[ROSTER-IMPORT] Import completato: ${entriesByTeam.size} team, ${totalPlayersImported} giocatori`
    );

    return {
      success: true,
      teamsImported: entriesByTeam.size,
      playersImported: totalPlayersImported,
      errors: [],
      warnings: validation.warnings,
      summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";
    console.error(`[ROSTER-IMPORT] Errore durante import: ${errorMessage}`, error);

    return {
      success: false,
      teamsImported: 0,
      playersImported: 0,
      errors: [`Errore durante l'import: ${errorMessage}`],
      warnings: validation.warnings,
      summary: [],
    };
  }
}
