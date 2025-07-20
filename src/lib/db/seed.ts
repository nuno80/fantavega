// src/lib/db/seed.ts v.1.2
// Aggiunto utente 'federico' con dati da Clerk.
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
  {
    id: "user_305PTUmZvR3qDMx41mZlqJDUVeZ",
    email: "feferico.08.fl@gmail.com",
    username: "federico",
    role: "user",
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
  });
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
