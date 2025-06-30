// src/lib/db/seed.ts v.1.1
// Aggiornato per usare 'timer_duration_minutes' invece di 'timer_duration_hours'.
import { db } from "./index";

// Dati di esempio
const users = [
  {
    id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
    email: "nuno@example.com",
    username: "nuno_admin",
    role: "admin",
  },
  {
    id: "user_2ybRb12u9haFhrS4U7w3d1Yl5zD",
    email: "mario.rossi@example.com",
    username: "mario_rossi",
    role: "manager",
  },
  {
    id: "user_2ybRgG0a0b1c2d3e4f5g6h7i8j9",
    email: "luca.bianchi@example.com",
    username: "luca_bianchi",
    role: "manager",
  },
  {
    id: "user_2ybRhJ1k2l3m4n5o6p7q8r9s0t",
    email: "paolo.verdi@example.com",
    username: "paolo_verdi",
    role: "manager",
  },
];

const players = [
  {
    id: 1,
    role: "P",
    name: "MAIGNAN",
    team: "MIL",
    current_quotation: 20,
    initial_quotation: 20,
  },
  {
    id: 2,
    role: "D",
    name: "BASTONI",
    team: "INT",
    current_quotation: 15,
    initial_quotation: 15,
  },
  {
    id: 3,
    role: "C",
    name: "KOOPMEINERS",
    team: "ATA",
    current_quotation: 25,
    initial_quotation: 25,
  },
  {
    id: 4,
    role: "A",
    name: "OSIMHEN",
    team: "NAP",
    current_quotation: 40,
    initial_quotation: 40,
  },
];

const leagues = [
  {
    id: 1,
    name: "Lega Fantavega 2024",
    league_type: "classic",
    initial_budget_per_manager: 500,
    status: "participants_joining",
    admin_creator_id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
    slots_P: 3,
    slots_D: 8,
    slots_C: 8,
    slots_A: 6,
    min_bid: 1,
    // CORREZIONE: Usiamo il nuovo nome della colonna
    timer_duration_minutes: 1440,
    config_json: JSON.stringify({ min_bid_rule: "fixed" }),
  },
];

// Funzione di seeding
function seedDatabase() {
  console.log("--- [SEED SCRIPT] LOG B: Funzione seedDatabase() INVOCATA ---");
  db.transaction(() => {
    // Seeding Utenti
    console.log("[SEED] Attempting to seed users...");
    const userStmt = db.prepare(
      "INSERT OR IGNORE INTO users (id, email, username, role) VALUES (?, ?, ?, ?)"
    );
    for (const user of users) {
      userStmt.run(user.id, user.email, user.username, user.role);
    }
    console.log(
      `[SEED] User seeding completed. Processed: ${users.length} users.`
    );

    // Seeding Giocatori
    console.log("[SEED] Attempting to seed players...");
    const playerStmt = db.prepare(
      "INSERT OR IGNORE INTO players (id, role, name, team, current_quotation, initial_quotation) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const player of players) {
      playerStmt.run(
        player.id,
        player.role,
        player.name,
        player.team,
        player.current_quotation,
        player.initial_quotation
      );
    }
    console.log(
      `[SEED] Player seeding completed. Processed: ${players.length} players.`
    );

    // Seeding Leghe
    console.log("[SEED] Attempting to seed leagues...");
    const leagueStmt = db.prepare(`
            INSERT OR IGNORE INTO auction_leagues (
                id, name, league_type, initial_budget_per_manager, status, admin_creator_id, 
                slots_P, slots_D, slots_C, slots_A, min_bid, timer_duration_minutes, config_json
            ) VALUES (
                @id, @name, @league_type, @initial_budget_per_manager, @status, @admin_creator_id,
                @slots_P, @slots_D, @slots_C, @slots_A, @min_bid, @timer_duration_minutes, @config_json
            )
        `);
    for (const league of leagues) {
      leagueStmt.run(league);
    }
    console.log(
      `[SEED] League seeding completed. Processed: ${leagues.length} leagues.`
    );
  })();
  console.log(
    "--- [SEED SCRIPT] LOG C: Transazione di seeding completata con successo. ---"
  );
}

// Esecuzione dello script
try {
  console.log(
    "--- [SEED SCRIPT] LOG A: Script seed.ts caricato ed eseguito da tsx ---"
  );
  console.log("--- [SEED SCRIPT] LOG D: Sto per chiamare seedDatabase() ---");
  seedDatabase();
  console.log(
    "--- [SEED SCRIPT] LOG E: seedDatabase() eseguita senza errori. ---"
  );
} catch (error) {
  console.error(
    "--- [SEED SCRIPT] ERROR during seedDatabase() execution, transaction rolled back. ---",
    error
  );
} finally {
  console.log(
    "--- [SEED SCRIPT] LOG G: Blocco finally raggiunto. Tento di chiudere la connessione DB. ---"
  );
  db.close();
  console.log(
    "[SEED SCRIPT] Direct DB instance closed by seed script's finally block."
  );
  console.log("--- [SEED SCRIPT] LOG H: Script seed.ts terminato. ---");
}
