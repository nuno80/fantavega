// tests/db/player-import.service.test.ts
// Regressione per il bug "l'import aggiunge i calciatori a quelli precedenti".
// Verifica che:
// - modalità update (default): upsert per ID + cleanup orfani protetta dalle rose
// - modalità replace: svuota catalogo e rose, poi importa il nuovo listone
import fs from "fs";
import path from "path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Client libSQL reale in-memory: nessun mock del comportamento DB.
vi.mock("@/lib/db", () => ({ db: createClient({ url: "file::memory:" }) }));

import { processPlayersExcel } from "@/lib/db/services/player-import.service";

const client: Client = (await import("@/lib/db")).db as Client;

// Costruisce un file Excel in memoria con la struttura del listone Fantacalcio:
// riga 1 = titolo, riga 2 = header, righe successive = dati.
function buildExcelBuffer(players: Array<Record<string, unknown>>): Buffer {
  // Import dinamico: xlsx è un modulo CJS pesante, caricato solo qui.
  const XLSX = require("xlsx") as typeof import("xlsx");
  const header = [
    "Id",
    "R",
    "RM",
    "Nome",
    "Squadra",
    "Qt.A",
    "Qt.I",
    "Qt.A M",
    "Qt.I M",
    "FVM",
    "FVM M",
  ];
  const aoa: unknown[][] = [["Listone Fantacalcio"], header];
  for (const p of players) {
    aoa.push([
      p.id,
      p.role,
      p.role_mantra ?? "",
      p.name,
      p.team,
      p.qtA,
      p.qtI,
      p.qtAM ?? "",
      p.qtIM ?? "",
      p.fvm ?? "",
      p.fvmM ?? "",
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tutti");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(buf);
}

describe("player-import.service (libSQL :memory:)", () => {
  let leagueId = 16;
  const userId = "u1";

  beforeAll(async () => {
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    await client.executeMultiple(schema);

    // Fixture FK: admin → lega → manager
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES ('admin-test', 'admin@test.dev', 'admin-test', 'admin', 'active')`,
      args: [],
    });
    await client.execute({
      sql: `INSERT INTO auction_leagues (id, name, status, initial_budget_per_manager, admin_creator_id)
            VALUES (?, 'Lega Test', 'draft_active', 500, 'admin-test')`,
      args: [leagueId],
    });
    await client.execute({
      sql: `INSERT INTO users (id, email, username, role, status)
            VALUES (?, 'u1@test.dev', 'u1', 'manager', 'active')`,
      args: [userId],
    });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    // Pulisce tutte le tabelle (ordine rispetta le FK).
    await client.execute("DELETE FROM player_assignments");
    await client.execute("DELETE FROM auctions");
    await client.execute("DELETE FROM players");
  });

  const insertPlayer = async (id: number, name: string, team: string, role = "A") => {
    await client.execute({
      sql: `INSERT INTO players (id, role, name, team, current_quotation, initial_quotation)
            VALUES (?, ?, ?, ?, 10, 10)`,
      args: [id, role, name, team],
    });
  };

  const countPlayers = async (): Promise<number> => {
    const r = await client.execute("SELECT COUNT(*) AS c FROM players");
    return Number(r.rows[0].c);
  };

  const countAssignments = async (): Promise<number> => {
    const r = await client.execute("SELECT COUNT(*) AS c FROM player_assignments");
    return Number(r.rows[0].c);
  };

  it("update mode: upsert per ID e orfani protetti dalle rose", async () => {
    // Catalogo esistente (stagione vecchia)
    await insertPlayer(100, "Vecchio Libero", "Torino");
    await insertPlayer(200, "Vecchio Rosa", "Genoa");
    await insertPlayer(300, "Vecchio Eliminabile", "Cagliari");

    // Giocatore 200 è in rosa in una lega (assegnazione)
    await client.execute({
      sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price)
            VALUES (16, 200, 'u1', 10)`,
      args: [],
    });

    // Nuovo listone (stagione nuova): il 200 resta (in rosa), il 100 cambia squadra,
    // il 300 sparisce, il 400 è nuovo.
    const buf = buildExcelBuffer([
      { id: 100, role: "D", name: "Vecchio Libero", team: "Inter", qtA: 12, qtI: 11 },
      { id: 200, role: "A", name: "Vecchio Rosa", team: "Genoa", qtA: 9, qtI: 8 },
      { id: 400, role: "C", name: "Nuovo Arrivato", team: "Milan", qtA: 15, qtI: 14 },
    ]);

    const result = await processPlayersExcel(buf, { replaceMode: false });

    expect(result.success).toBe(true);
    expect(result.successfullyUpsertedRows).toBe(3);
    // Il 300 non è nel file, non è in rosa, non ha aste → eliminato
    expect(result.deletedOrphanPlayers).toBe(1);

    // Catalogo: 100 (aggiornato), 200 (protetto dalla rosa), 400 (nuovo)
    const players = await client.execute(
      "SELECT id, team FROM players ORDER BY id"
    );
    expect(players.rows.map((r) => r.id)).toEqual([100, 200, 400]);
    // Il 100 ha la squadra aggiornata (stesso ID, cambio squadra)
    const p100 = await client.execute("SELECT team FROM players WHERE id = 100");
    expect(p100.rows[0].team).toBe("Inter");
  });

  it("update mode: il giocatore in rosa che esce dal listone resta nel catalogo", async () => {
    await insertPlayer(500, "Partente", "Bologna");
    await client.execute({
      sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price)
            VALUES (16, 500, 'u1', 10)`,
      args: [],
    });

    const buf = buildExcelBuffer([
      { id: 600, role: "A", name: "Solo Nuovo", team: "Roma", qtA: 5, qtI: 5 },
    ]);
    const result = await processPlayersExcel(buf, { replaceMode: false });

    expect(result.success).toBe(true);
    // Il 500 non è nel file ma è in rosa → resta
    const p500 = await client.execute("SELECT id FROM players WHERE id = 500");
    expect(p500.rows).toHaveLength(1);
    expect(await countAssignments()).toBe(1);
    expect(result.deletedOrphanPlayers).toBe(0);
  });

  it("replace mode: svuota catalogo e rose, poi importa il nuovo listone", async () => {
    await insertPlayer(100, "Vecchio Libero", "Torino");
    await insertPlayer(200, "Vecchio Rosa", "Genoa");
    await client.execute({
      sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price)
            VALUES (16, 200, 'u1', 10)`,
      args: [],
    });

    const buf = buildExcelBuffer([
      { id: 700, role: "P", name: "Nuovo Portiere", team: "Juventus", qtA: 20, qtI: 18 },
      { id: 701, role: "D", name: "Nuovo Difensore", team: "Napoli", qtA: 14, qtI: 13 },
    ]);
    const result = await processPlayersExcel(buf, { replaceMode: true });

    expect(result.success).toBe(true);
    expect(result.clearedPlayers).toBe(2); // catalogo svuotato prima dell'import
    expect(result.successfullyUpsertedRows).toBe(2);

    // Catalogo solo nuovo, rose azzerate
    const players = await client.execute("SELECT id FROM players ORDER BY id");
    expect(players.rows.map((r) => r.id)).toEqual([700, 701]);
    expect(await countAssignments()).toBe(0);
  });

  it("replace mode con file vuoto: nessuna cancellazione (sicurezza)", async () => {
    await insertPlayer(100, "Solo Giocatore", "Torino");
    await client.execute({
      sql: `INSERT INTO player_assignments (auction_league_id, player_id, user_id, purchase_price)
            VALUES (16, 100, 'u1', 10)`,
      args: [],
    });

    // File con soli header, nessuna riga dati
    const buf = buildExcelBuffer([]);
    const result = await processPlayersExcel(buf, { replaceMode: true });

    expect(result.success).toBe(false);
    // Nessuna cancellazione: il file non è valido
    expect(await countPlayers()).toBe(1);
    expect(await countAssignments()).toBe(1);
  });
});
