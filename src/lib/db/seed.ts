// src/lib/db/seed.ts (o il tuo percorso effettivo)
import { closeDbConnection, db } from "@/lib/db";

// --- DATI DI ESEMPIO ---
const usersToSeed = [
  {
    id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
    email: "nuno.80.al@gmail.com",
    username: "adminuser",
    full_name: "Admin User",
    role: "admin",
    status: "active",
  },
  {
    id: "user_2yAf7DnJ7asI88hIP03WtYnzxDL",
    email: "user1@test.com",
    username: "managerone",
    full_name: "Manager One",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2yAfBFNfcgcJOQqCFJj6WNkBkNu",
    email: "user2@test.com",
    username: "managertwo",
    full_name: "Manager Two",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2yAfEFTxxNtBlL37Ixq9YHLmqAb",
    email: "user3@test.com",
    username: "managerthree",
    full_name: "Manager Three",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2vultw8Mzhm6PZDOuiMHtd2IPJ3",
    email: "armandoluongo@yahoo.it",
    username: "managerfour",
    full_name: "Manager Four",
    role: "manager",
    status: "active",
  },
];

const playersToSeed = [
  {
    id: 572,
    role: "P",
    name: "Meret",
    team: "Napoli",
    current_quotation: 18,
    initial_quotation: 15,
    fvm: 117,
    role_mantra: "Por",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  {
    id: 2170,
    role: "P",
    name: "Milinkovic-Savic V.",
    team: "Torino",
    current_quotation: 17,
    initial_quotation: 10,
    fvm: 63,
    role_mantra: "Por",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  {
    id: 123,
    role: "D",
    name: "Difensore Prova",
    team: "TeamX",
    current_quotation: 10,
    initial_quotation: 8,
    fvm: 50,
    role_mantra: "Dc",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  {
    id: 456,
    role: "C",
    name: "Centrocampista Prova",
    team: "TeamY",
    current_quotation: 15,
    initial_quotation: 12,
    fvm: 70,
    role_mantra: "M;C",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  {
    id: 789,
    role: "A",
    name: "Attaccante Prova",
    team: "TeamZ",
    current_quotation: 25,
    initial_quotation: 20,
    fvm: 90,
    role_mantra: "Pc",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  {
    id: 3001, // ID univoco
    role: "P",
    name: "Portiere Nuovo Uno",
    team: "Squadra Inventata A",
    current_quotation: 12,
    initial_quotation: 10,
    fvm: 50, // Fantavoto medio (puoi inventarlo)
    role_mantra: "Por",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000),
  },
  {
    id: 3002, // ID univoco
    role: "P",
    name: "Portiere Nuovo Due",
    team: "Squadra Inventata B",
    current_quotation: 14,
    initial_quotation: 12,
    fvm: 60,
    role_mantra: "Por",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000),
  },
  {
    id: 1001,
    role: "P",
    name: "Portiere Alpha",
    team: "Alpha FC",
    current_quotation: 12,
    initial_quotation: 10,
    fvm: 55,
    role_mantra: "Por",
    photo_url: null,
    current_quotation_mantra: null,
    initial_quotation_mantra: null,
    fvm_mantra: null,
    last_updated_from_source: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
  },
  // Assicurati di aver completato gli altri 9 giocatori fittizi qui, come nell'esempio sopra
];

const leaguesToSeed = [
  {
    name: "Fantacalcio Serie A - Test League 2024/25",
    league_type: "classic",
    initial_budget_per_manager: 500,
    status: "draft_active", // Mettiamola subito in draft_active per i test
    admin_creator_id:
      usersToSeed.find((u) => u.role === "admin")?.id || usersToSeed[0].id,
    active_auction_roles: "P,D,C", // Apriamo tutti i ruoli per testare
    draft_window_start: Math.floor(Date.now() / 1000) - 3600 * 24, // Ieri
    draft_window_end: Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // Tra una settimana
    slots_P: 2,
    slots_D: 8,
    slots_C: 8,
    slots_A: 6,
    min_bid: 1, // <<--- NUOVO CAMPO
    timer_duration_hours: 24, // <<--- NUOVO CAMPO
    config_json: JSON.stringify({
      note: "Lega di test principale con nuove colonne",
    }),
  },
];

// Funzione principale di seeding
async function seedDatabase() {
  console.log("Starting database seeding...");
  const now = Math.floor(Date.now() / 1000);

  // Inserisci Utenti
  const insertUserStmt = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, username, full_name, role, status, created_at, updated_at)
    VALUES (@id, @email, @username, @full_name, @role, @status, @createdAt, @updatedAt)
  `);
  console.log("Seeding users...");
  for (const user of usersToSeed) {
    insertUserStmt.run({ ...user, createdAt: now, updatedAt: now });
  }
  console.log(`${usersToSeed.length} users processed for seeding.`);

  // Inserisci Giocatori
  const insertPlayerStmt = db.prepare(`
    INSERT OR IGNORE INTO players (
      id, role, role_mantra, name, team, current_quotation, initial_quotation,
      current_quotation_mantra, initial_quotation_mantra, fvm, fvm_mantra, photo_url,
      last_updated_from_source, created_at, updated_at
    ) VALUES (
      @id, @role, @role_mantra, @name, @team, @current_quotation, @initial_quotation,
      @current_quotation_mantra, @initial_quotation_mantra, @fvm, @fvm_mantra, @photo_url,
      @last_updated_from_source, @created_at, @updated_at
    )
  `);
  console.log("Seeding players...");
  for (const player of playersToSeed) {
    insertPlayerStmt.run({
      ...player,
      current_quotation_mantra: player.current_quotation_mantra ?? null,
      initial_quotation_mantra: player.initial_quotation_mantra ?? null,
      fvm_mantra: player.fvm_mantra ?? null,
      photo_url: player.photo_url ?? null,
      last_updated_from_source: player.last_updated_from_source ?? now - 86400,
      created_at: now,
      updated_at: now,
    });
  }
  console.log(`${playersToSeed.length} players seeded.`);

  // Inserisci Leghe
  const insertLeagueStmt = db.prepare(`
    INSERT INTO auction_leagues (
      name, league_type, initial_budget_per_manager, status, admin_creator_id,
      active_auction_roles, draft_window_start, draft_window_end,
      slots_P, slots_D, slots_C, slots_A, 
      min_bid, timer_duration_hours,  -- <<--- NUOVE COLONNE
      config_json, created_at, updated_at
    ) VALUES (
      @name, @league_type, @initial_budget_per_manager, @status, @admin_creator_id,
      @active_auction_roles, @draft_window_start, @draft_window_end,
      @slots_P, @slots_D, @slots_C, @slots_A,
      @min_bid, @timer_duration_hours, -- <<--- NUOVI PLACEHOLDER
      @config_json, @created_at, @updated_at
    )
  `);

  console.log("Seeding auction leagues...");

  let seededLeagueId: number | undefined; // Dichiarazione corretta di seededLeagueId

  if (leaguesToSeed.length > 0) {
    for (const league of leaguesToSeed) {
      // Esegui l'insert e ottieni l'oggetto info
      const info = insertLeagueStmt.run({
        // ... altri campi ...
        name: league.name,
        league_type: league.league_type,
        initial_budget_per_manager: league.initial_budget_per_manager,
        status: league.status,
        admin_creator_id: league.admin_creator_id,
        active_auction_roles: league.active_auction_roles,
        draft_window_start: league.draft_window_start,
        draft_window_end: league.draft_window_end,
        slots_P: league.slots_P,
        slots_D: league.slots_D,
        slots_C: league.slots_C,
        slots_A: league.slots_A,
        min_bid: league.min_bid, // <<--- NUOVO VALORE
        timer_duration_hours: league.timer_duration_hours, // <<--- NUOVO VALORE
        config_json: league.config_json,
        created_at: now,
        updated_at: now,
      });

      // Assegna l'ID dell'ultima riga inserita
      // Questo sarà l'ID dell'ultima lega nel loop se ce ne sono molte,
      // ma per una sola lega, sarà l'ID di quella lega.
      seededLeagueId = info.lastInsertRowid as number;
      console.log(`Seeded league "${league.name}" with ID: ${seededLeagueId}`);
    }
    console.log(
      `${leaguesToSeed.length} leagues seeded. Last league ID processed: ${seededLeagueId}`
    );
  } else {
    console.log("No leagues to seed. Skipping participant enrollment.");
  }

  // CORREZIONE: La graffa del for loop era nel posto sbagliato
  // Il codice per ottenere firstLeague e il console.log successivo non sono più necessari
  // se usiamo lastInsertRowid e abbiamo il log dentro il loop o subito dopo.

  // Iscrivi i manager alla lega di test
  // Assicurati che seededLeagueId abbia un valore prima di procedere
  if (
    seededLeagueId !== undefined &&
    usersToSeed.find((u) => u.role === "admin")
  ) {
    // Recupera il budget dalla lega specifica usando l'ID ottenuto
    const leagueForBudget = db
      .prepare(
        "SELECT initial_budget_per_manager FROM auction_leagues WHERE id = ?"
      )
      .get(seededLeagueId) as
      | { initial_budget_per_manager: number }
      | undefined;

    if (!leagueForBudget) {
      console.error(
        `Could not find league with ID ${seededLeagueId} to retrieve budget for participants.`
      );
    } else {
      const initialBudget = leagueForBudget.initial_budget_per_manager;
      const managersToEnroll = usersToSeed.filter((u) => u.role === "manager");

      const enrollManagerStmt = db.prepare(`
          INSERT OR IGNORE INTO league_participants (
            league_id, user_id, current_budget, locked_credits,
            players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired,
            joined_at
          ) VALUES (
            @league_id, @user_id, @current_budget, 0,
            0, 0, 0, 0,
            @joined_at
          )
        `);
      console.log(
        `Enrolling ${managersToEnroll.length} managers to league ID ${seededLeagueId} with budget ${initialBudget}...`
      );
      for (const manager of managersToEnroll) {
        enrollManagerStmt.run({
          league_id: seededLeagueId,
          user_id: manager.id,
          current_budget: initialBudget,
          joined_at: now,
        });
      }
      console.log("Managers enrolled.");
    }
  } else {
    console.log(
      "Skipping manager enrollment: No leagues were seeded, admin user not found, or seededLeagueId is not set."
    );
  }

  console.log("Database seeding completed.");
} // Chiusura della funzione seedDatabase

seedDatabase()
  .catch((err) => {
    console.error("Error during seeding:", err);
    process.exit(1);
  })
  .finally(() => {
    if (db && db.open) {
      closeDbConnection();
      console.log("Database connection closed by seed script.");
    }
  });
