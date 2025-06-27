import { db } from "@/lib/db";

// src/lib/db/seed.ts v.1.1 (Struttura completa con logging e gestione connessione)

console.log(
  "--- [SEED SCRIPT] LOG A: Script seed.ts caricato ed eseguito da tsx ---"
);
// Assumendo che questo sia il tuo modo di ottenere l'istanza db
// Se db/index.ts esporta una funzione getInstance, potresti doverla chiamare.
// Se db è già l'istanza, va bene.

// --- DATI DI ESEMPIO ---
// Incolla qui i tuoi array: usersToSeed, playersToSeed, leaguesToSeed
// Esempio (DEVI SOSTITUIRLI CON I TUOI DATI REALI):
const usersToSeed = [
  {
    id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe",
    email: "admin@example.com",
    username: "adminuser",
    full_name: "Admin User",
    role: "admin",
    status: "active",
  },
  {
    id: "user_2vultw8Mzhm6PZDOuiMHtd2IPJ3",
    email: "managerA@example.com",
    username: "auctiontester",
    full_name: "Auction Tester",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2yAf7DnJ7asI88hIP03WtYnzxDL",
    email: "managerB@example.com",
    username: "managerone",
    full_name: "Manager One",
    role: "manager",
    status: "active",
  },
  // Aggiungi altri manager se necessario per i tuoi test
  {
    id: "user_2ybRb12u9haFhrS4U7w3d1Yl5zD",
    email: "user_test_new@example.com",
    username: "managertestnew",
    full_name: "Manager Test New",
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
  },
  // Aggiungi altri giocatori necessari per i test di compliance (N-1 slot)
];

const leaguesToSeed = [
  {
    name: "Fantacalcio Serie A - Test League 2024/25",
    league_type: "classic",
    initial_budget_per_manager: 500,
    status: "draft_active", // O 'setup'/'participants_joining' se vuoi testare l'aggiunta di partecipanti
    admin_creator_id:
      usersToSeed.find((u) => u.role === "admin")?.id ||
      usersToSeed[0]?.id ||
      "fallback_admin_id_error", // Assicurati che ci sia un admin
    active_auction_roles: "P,D,C,A",
    draft_window_start: Math.floor(Date.now() / 1000) - 3600 * 24 * 2,
    draft_window_end: Math.floor(Date.now() / 1000) + 3600 * 24 * 7,
    slots_P: 3,
    slots_D: 8,
    slots_C: 8,
    slots_A: 6, // Assicurati che questi corrispondano ai requisiti N-1
    min_bid: 1,
    timer_duration_hours: 24,
    config_json: JSON.stringify({ note: "Lega di test principale." }),
  },
];
// --- FINE DATI DI ESEMPIO ---

async function seedDatabase() {
  console.log("--- [SEED SCRIPT] LOG B: Funzione seedDatabase() INVOCATA ---");
  const now = Math.floor(Date.now() / 1000);
  let seededLeagueId: number | undefined;

  db.exec("BEGIN TRANSACTION;"); // Inizia una transazione generale per tutto il seed

  try {
    // Blocco 5.1: Inserisci Utenti
    console.log("[SEED] Attempting to seed users...");
    const insertUserStmt = db.prepare(`
      INSERT OR IGNORE INTO users (id, email, username, full_name, role, status, created_at, updated_at)
      VALUES (@id, @email, @username, @full_name, @role, @status, @created_at, @updated_at)
    `);
    for (const user of usersToSeed) {
      insertUserStmt.run({ ...user, created_at: now, updated_at: now });
    }
    console.log(
      `[SEED] User seeding completed. Processed: ${usersToSeed.length} users.`
    );

    // Blocco 5.2: Inserisci Giocatori
    console.log("[SEED] Attempting to seed players...");
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
    for (const player of playersToSeed) {
      insertPlayerStmt.run({
        ...player, // Assumi che i campi opzionali non presenti in player siano gestiti con ?? null
        role_mantra: player.role_mantra ?? null,
        current_quotation_mantra:
          (player as any).current_quotation_mantra ?? null,
        initial_quotation_mantra:
          (player as any).initial_quotation_mantra ?? null,
        fvm: player.fvm ?? null,
        fvm_mantra: (player as any).fvm_mantra ?? null,
        photo_url: (player as any).photo_url ?? null,
        last_updated_from_source:
          (player as any).last_updated_from_source ?? now - 86400 * 7,
        created_at: now,
        updated_at: now,
      });
    }
    console.log(
      `[SEED] Player seeding completed. Processed: ${playersToSeed.length} players.`
    );

    // Blocco 5.3: Inserisci Leghe
    console.log("[SEED] Attempting to seed leagues...");
    const insertLeagueStmt = db.prepare(
      `INSERT INTO auction_leagues (name, league_type, initial_budget_per_manager, status, admin_creator_id, 
                                    active_auction_roles, draft_window_start, draft_window_end, 
                                    slots_P, slots_D, slots_C, slots_A, min_bid, timer_duration_hours, config_json, 
                                    created_at, updated_at)
         VALUES (@name, @league_type, @initial_budget_per_manager, @status, @admin_creator_id,
                 @active_auction_roles, @draft_window_start, @draft_window_end,
                 @slots_P, @slots_D, @slots_C, @slots_A, @min_bid, @timer_duration_hours, @config_json,
                 @created_at, @updated_at)`
    );
    if (leaguesToSeed.length > 0) {
      for (const leagueData of leaguesToSeed) {
        // Itera se hai più leghe da seedare
        const adminCreator = usersToSeed.find((u) => u.role === "admin");
        if (!adminCreator) {
          console.error(
            "[SEED] CRITICAL: No admin user found in usersToSeed to assign as league creator. Skipping league seeding."
          );
          continue; // Salta questa lega se non c'è admin
        }
        try {
          const info = insertLeagueStmt.run({
            ...leagueData,
            admin_creator_id: adminCreator.id, // Usa l'ID dell'admin trovato
            created_at: now,
            updated_at: now,
          });
          if (info.lastInsertRowid) {
            if (!seededLeagueId)
              seededLeagueId = info.lastInsertRowid as number; // Prendi il primo ID lega per i partecipanti
            console.log(
              `[SEED] Seeded league "${leagueData.name}" with ID: ${info.lastInsertRowid}`
            );
          } else {
            console.error(
              `[SEED] Failed to get lastInsertRowid for league "${leagueData.name}".`
            );
          }
        } catch (e: any) {
          console.error(
            `[SEED] Error seeding league "${leagueData.name}":`,
            e.message
          );
        }
      }
    } else {
      console.log("[SEED] No leagues to seed.");
    }
    console.log(
      "[SEED] League seeding completed. Last seededLeagueId (if any):",
      seededLeagueId
    );

    // Blocco 5.4: Iscrivi Manager
    console.log("[SEED] Attempting to enroll managers...");
    let teamCounter = 0;
    if (seededLeagueId !== undefined) {
      const leagueForBudget = db
        .prepare(
          "SELECT initial_budget_per_manager FROM auction_leagues WHERE id = ?"
        )
        .get(seededLeagueId) as
        | { initial_budget_per_manager: number }
        | undefined;
      if (!leagueForBudget) {
        console.error(
          `[SEED] Could not find league with ID ${seededLeagueId} for participant enrollment.`
        );
      } else {
        const initialBudget = leagueForBudget.initial_budget_per_manager;
        const managersToEnroll = usersToSeed.filter(
          (u) => u.role === "manager"
        );
        if (managersToEnroll.length > 0) {
          const enrollManagerStmt = db.prepare(`
            INSERT OR IGNORE INTO league_participants (league_id, user_id, current_budget, manager_team_name, joined_at, updated_at) 
            VALUES (@league_id, @user_id, @current_budget, @manager_team_name, @joined_at, @updated_at)`);
          console.log(
            `[SEED] Enrolling ${managersToEnroll.length} managers to league ID ${seededLeagueId} with budget ${initialBudget}...`
          );
          for (const manager of managersToEnroll) {
            let managerTeamName: string;
            if (manager.username && manager.username.trim() !== "") {
              managerTeamName = `Team ${manager.username.trim()}`;
            } else {
              managerTeamName = `Squadra #${teamCounter}`;
              teamCounter++;
            }
            enrollManagerStmt.run({
              league_id: seededLeagueId,
              user_id: manager.id,
              current_budget: initialBudget,
              manager_team_name: managerTeamName,
              joined_at: now,
              updated_at: now,
            });
            console.log(
              `[SEED] Enrolled manager ${manager.username || manager.id} (User ID: ${manager.id}) as "${managerTeamName}" in league ${seededLeagueId}.`
            );
          }
          console.log("[SEED] Managers enrollment process completed.");
        } else {
          console.log("[SEED] No managers found to enroll.");
        }
      }
    } else {
      console.log(
        "[SEED] Skipping manager enrollment as no league was seeded."
      );
    }

    // Blocco 5.5: Inserisci Aste e Offerte di Test
    console.log("[SEED] Attempting to seed test auctions and bids...");
    if (seededLeagueId !== undefined) {
      const oneHourAgo = now - 3600;
      const oneDayInFuture = now + 24 * 3600;
      const player572 = playersToSeed.find((p) => p.id === 572);
      const player1001 = playersToSeed.find((p) => p.id === 1001);
      const managerAuctionTester = usersToSeed.find(
        (u) => u.username === "auctiontester"
      );
      const managerOne = usersToSeed.find((u) => u.username === "managerone");

      if (player572 && player1001 && managerAuctionTester && managerOne) {
        const expiredAuctionData = {
          auction_league_id: seededLeagueId,
          player_id: 572,
          start_time: oneHourAgo - 86400,
          scheduled_end_time: oneHourAgo,
          current_highest_bid_amount: 10,
          current_highest_bidder_id: managerAuctionTester.id,
          status: "active",
          created_at: oneHourAgo - 86400,
          updated_at: oneHourAgo,
        };
        const activeAuctionData = {
          auction_league_id: seededLeagueId,
          player_id: 1001,
          start_time: now - 3600,
          scheduled_end_time: oneDayInFuture,
          current_highest_bid_amount: 15,
          current_highest_bidder_id: managerOne.id,
          status: "active",
          created_at: now - 3600,
          updated_at: now - 3600,
        };

        const insertAuctionStmt = db.prepare(
          `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at) VALUES (@auction_league_id, @player_id, @start_time, @scheduled_end_time, @current_highest_bid_amount, @current_highest_bidder_id, @status, @created_at, @updated_at)`
        );
        const insertBidStmt = db.prepare(
          `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, ?)`
        );

        try {
          const expiredInfo = insertAuctionStmt.run(expiredAuctionData);
          console.log(
            `[SEED] Seeded expired auction ID: ${expiredInfo.lastInsertRowid} for player ${expiredAuctionData.player_id}`
          );
          insertBidStmt.run(
            expiredInfo.lastInsertRowid,
            expiredAuctionData.current_highest_bidder_id,
            expiredAuctionData.current_highest_bid_amount,
            expiredAuctionData.start_time,
            "manual"
          );
        } catch (e: any) {
          console.error(
            `[SEED] Error seeding expired auction for player ${expiredAuctionData.player_id}:`,
            e.message.includes("UNIQUE constraint failed")
              ? "Already exists or UNIQUE constraint."
              : e.message
          );
        }

        try {
          const activeInfo = insertAuctionStmt.run(activeAuctionData);
          console.log(
            `[SEED] Seeded active auction ID: ${activeInfo.lastInsertRowid} for player ${activeAuctionData.player_id}`
          );
          insertBidStmt.run(
            activeInfo.lastInsertRowid,
            activeAuctionData.current_highest_bidder_id,
            activeAuctionData.current_highest_bid_amount,
            activeAuctionData.start_time,
            "manual"
          );
        } catch (e: any) {
          console.error(
            `[SEED] Error seeding active auction for player ${activeAuctionData.player_id}:`,
            e.message.includes("UNIQUE constraint failed")
              ? "Already exists or UNIQUE constraint."
              : e.message
          );
        }
      } else {
        console.warn(
          "[SEED] Test players or managers for auction seeding not found. Skipping test auction seeding."
        );
      }
    } else {
      console.log(
        "[SEED] Skipping test auction seeding as no league was seeded."
      );
    }
    console.log("[SEED] Test auction and bid seeding completed.");

    db.exec("COMMIT;"); // Committa la transazione generale
    console.log(
      "--- [SEED SCRIPT] LOG C: Funzione seedDatabase() DB operations committed. ---"
    );
  } catch (error) {
    db.exec("ROLLBACK;"); // Rollback in caso di errore durante il seeding
    console.error(
      "--- [SEED SCRIPT] ERROR during seedDatabase() execution, transaction rolled back. ---",
      error
    );
    throw error; // Rilancia l'errore per essere catturato dal blocco catch esterno
  }
} // Fine della funzione seedDatabase

// CHIAMATA ALLA FUNZIONE PRINCIPALE E GESTIONE PROMISE/FINALLY
console.log("--- [SEED SCRIPT] LOG D: Sto per chiamare seedDatabase() ---");

seedDatabase()
  .then(() => {
    console.log(
      "--- [SEED SCRIPT] LOG E: seedDatabase() promise RESOLVED (completata con successo). ---"
    );
  })
  .catch((err) => {
    console.error(
      "--- [SEED SCRIPT] LOG F: CRITICAL ERROR during overall seeding process (after function call): ---",
      err
    );
    // process.exit(1); // Sconsigliato uscire qui se la connessione non è chiusa
  })
  .finally(() => {
    console.log(
      "--- [SEED SCRIPT] LOG G: Blocco finally raggiunto. Tento di chiudere la connessione DB. ---"
    );
    if (
      (global as any).dbInstance &&
      typeof (global as any).dbInstance.close === "function"
    ) {
      try {
        (global as any).dbInstance.close();
        console.log(
          "[SEED SCRIPT] Global DB instance closed by seed script's finally block."
        );
        delete (global as any).dbInstance;
      } catch (e) {
        console.error(
          "[SEED SCRIPT] Error closing global DB instance in finally block:",
          e
        );
      }
    } else if (
      db &&
      typeof (db as any).close === "function" &&
      (db as any).open
    ) {
      // Controlla se db.open è true
      try {
        (db as any).close();
        console.log(
          "[SEED SCRIPT] Direct DB instance closed by seed script's finally block."
        );
      } catch (e) {
        console.error(
          "[SEED SCRIPT] Error closing direct DB instance in finally block:",
          e
        );
      }
    } else {
      console.warn(
        "[SEED SCRIPT] No active/recognizable DB instance to close in finally block."
      );
    }
    console.log("--- [SEED SCRIPT] LOG H: Script seed.ts terminato. ---");
  });
