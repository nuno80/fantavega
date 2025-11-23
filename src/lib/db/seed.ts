// src/lib/db/seed.ts v.2.0 (Async Turso Migration)
// Aggiunto seeding per leghe e partecipanti per creare uno scenario di test completo.
import { closeDbConnection, db } from "./index";

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
  {
    id: "user_305PTUmZvR3qDMx41mZlqJDUVeZ",
    email: "feferico.08.fl@gmail.com",
    username: "federico",
    role: "manager", // Assicuriamoci che sia manager per partecipare
  },
];

const leagues = [
  {
    id: 1000,
    name: "Lega Fantastica 2024",
    initial_budget_per_manager: 500,
    admin_creator_id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
  },
  {
    id: 1001,
    name: "Lega Super Pro 2025",
    initial_budget_per_manager: 1000,
    admin_creator_id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
  },
];

const participants = [
  // Federico in entrambe le leghe
  {
    league_id: 1000,
    user_id: "user_305PTUmZvR3qDMx41mZlqJDUVeZ",
    current_budget: 500,
    manager_team_name: "team fede",
  },
  {
    league_id: 1001,
    user_id: "user_305PTUmZvR3qDMx41mZlqJDUVeZ",
    current_budget: 1000,
    manager_team_name: "team fede",
  },
  // Altri partecipanti
  {
    league_id: 1000,
    user_id: "user_2ybRb12u9haFhrS4U7w3d1Yl5zD",
    current_budget: 500,
    manager_team_name: "team mario",
  },
  {
    league_id: 1001,
    user_id: "user_2ybRgG0a0b1c2d3e4f5g6h7i8j9",
    current_budget: 1000,
    manager_team_name: "team luca",
  },
];

// Funzione di seeding
async function seedDatabase() {
  console.log("--- [SEED SCRIPT] LOG B: Funzione seedDatabase() INVOCATA ---");

  const tx = await db.transaction("write");

  try {
    // Seeding Utenti
    console.log("[SEED] Attempting to seed users...");
    for (const user of users) {
      await tx.execute({
        sql: "INSERT OR IGNORE INTO users (id, email, username, role) VALUES (?, ?, ?, ?)",
        args: [user.id, user.email, user.username, user.role]
      });
    }
    console.log(
      `[SEED] User seeding completed. Processed: ${users.length} users.`
    );

    // Seeding Leghe
    console.log("[SEED] Attempting to seed leagues...");
    for (const league of leagues) {
      await tx.execute({
        sql: "INSERT OR IGNORE INTO auction_leagues (id, name, initial_budget_per_manager, admin_creator_id) VALUES (?, ?, ?, ?)",
        args: [league.id, league.name, league.initial_budget_per_manager, league.admin_creator_id]
      });
    }
    console.log(
      `[SEED] League seeding completed. Processed: ${leagues.length} leagues.`
    );

    // Seeding Partecipanti
    console.log("[SEED] Attempting to seed participants...");
    for (const participant of participants) {
      await tx.execute({
        sql: "INSERT OR IGNORE INTO league_participants (league_id, user_id, current_budget, manager_team_name) VALUES (?, ?, ?, ?)",
        args: [participant.league_id, participant.user_id, participant.current_budget, participant.manager_team_name]
      });
    }
    console.log(
      `[SEED] Participant seeding completed. Processed: ${participants.length} participants.`
    );

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// Esecuzione dello script
(async () => {
  try {
    console.log(
      "--- [SEED SCRIPT] LOG A: Script seed.ts caricato ed eseguito da tsx ---"
    );
    console.log("--- [SEED SCRIPT] LOG D: Sto per chiamare seedDatabase() ---");
    await seedDatabase();
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
    closeDbConnection();
    console.log(
      "[SEED SCRIPT] Direct DB instance closed by seed script's finally block."
    );
    console.log("--- [SEED SCRIPT] LOG H: Script seed.ts terminato. ---");
  }
})();
