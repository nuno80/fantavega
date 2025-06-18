// src/lib/db/seed.ts v.1.1
// Script per popolare il database con dati di esempio e scenari di test.
// 1. Importazioni
import { closeDbConnection, db } from "@/lib/db";

// 2. Dati di Esempio per Utenti
const usersToSeed = [
  {
    id: "user_2vJ5o9wgDIZM6wtwEx8XW36PrOe", // Admin
    email: "nuno.80.al@gmail.com",
    username: "adminuser",
    full_name: "Admin User",
    role: "admin",
    status: "active",
  },
  {
    id: "user_2yAf7DnJ7asI88hIP03WtYnzxDL", // Manager 1
    email: "user1@test.com",
    username: "managerone",
    full_name: "Manager One",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2yAfBFNfcgcJOQqCFJj6WNkBkNu", // Manager 2
    email: "user2@test.com",
    username: "managertwo",
    full_name: "Manager Two",
    role: "manager",
    status: "active",
  },
  {
    id: "user_2vultw8Mzhm6PZDOuiMHtd2IPJ3", // Manager di test per aste (ex managerfour)
    email: "armandoluongo@yahoo.it",
    username: "auctiontester",
    full_name: "Auction Tester Manager",
    role: "manager",
    status: "active",
  },
    { // <-- AGGIUNGI QUESTO UTENTE SE MANCA
    id: "user_2ybRb12u9haFhrS4U7w3d1Yl5zD", 
    email: "user_test_new@example.com", // Metti un'email unica
    username: "managertest4",         // Metti uno username unico
    full_name: "Manager Test New",
    role: "manager",
    status: "active",
  }
];

// 3. Dati di Esempio per Giocatori
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
    id: 2170,
    role: "P",
    name: "Milinkovic-Savic V.",
    team: "Torino",
    current_quotation: 17,
    initial_quotation: 10,
    fvm: 63,
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
    id: 456,
    role: "C",
    name: "Centrocampista Prova",
    team: "TeamY",
    current_quotation: 15,
    initial_quotation: 12,
    fvm: 70,
    role_mantra: "M;C",
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
];

// 4. Dati di Esempio per Leghe
const leaguesToSeed = [
  {
    name: "Fantacalcio Serie A - Test League 2024/25",
    league_type: "classic",
    initial_budget_per_manager: 500,
    status: "draft_active",
    admin_creator_id:
      usersToSeed.find((u) => u.role === "admin")?.id || usersToSeed[0].id,
    active_auction_roles: "P,D,C,A", // Tutti i ruoli attivi per test completi
    draft_window_start: Math.floor(Date.now() / 1000) - 3600 * 24 * 2, // Iniziata due giorni fa
    draft_window_end: Math.floor(Date.now() / 1000) + 3600 * 24 * 7, // Finisce tra una settimana
    slots_P: 2,
    slots_D: 8,
    slots_C: 8,
    slots_A: 6,
    min_bid: 1,
    timer_duration_hours: 24,
    config_json: JSON.stringify({
      note: "Lega di test principale con tutti i ruoli attivi.",
    }),
  },
];

// 5. Funzione Principale di Seeding
async function seedDatabase() {
  console.log("Starting database seeding...");
  const now = Math.floor(Date.now() / 1000);

  // 5.1. Inserisci Utenti
  const insertUserStmt = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, username, full_name, role, status, created_at, updated_at)
    VALUES (@id, @email, @username, @full_name, @role, @status, @createdAt, @updatedAt)
  `);
  console.log("Seeding users...");
  for (const user of usersToSeed) {
    insertUserStmt.run({ ...user, createdAt: now, updatedAt: now });
  }
  console.log(`${usersToSeed.length} users processed for seeding.`);

  // 5.2. Inserisci Giocatori
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
    // Definiamo un'interfaccia per l'oggetto player come definito in playersToSeed
    // per aiutare TypeScript e rendere più chiaro l'accesso alle proprietà.
    // Questo è opzionale ma migliora la leggibilità e la type safety.
    interface PlayerSeedObject {
      id: number;
      role: string;
      name: string;
      team: string;
      current_quotation: number;
      initial_quotation: number;
      fvm: number;
      role_mantra: string;
      // Aggiungi qui altre proprietà se sono definite in playersToSeed,
      // ad esempio: last_updated_from_source?: number;
    }

    // Cast dell'oggetto player all'interfaccia definita (o usa l'inferenza di tipo se preferisci)
    const currentPlayer = player as PlayerSeedObject;

    insertPlayerStmt.run({
      id: currentPlayer.id,
      role: currentPlayer.role,
      role_mantra: currentPlayer.role_mantra, // Assumendo sia sempre definito in playersToSeed
      name: currentPlayer.name,
      team: currentPlayer.team,
      current_quotation: currentPlayer.current_quotation,
      initial_quotation: currentPlayer.initial_quotation,
      current_quotation_mantra: null, // Non presente in PlayerSeedObject (e quindi in playersToSeed), quindi NULL
      initial_quotation_mantra: null, // Non presente in PlayerSeedObject, quindi NULL
      fvm: currentPlayer.fvm, // Assumendo sia sempre definito in playersToSeed
      fvm_mantra: null, // Non presente in PlayerSeedObject, quindi NULL
      photo_url: null, // Non presente in PlayerSeedObject, quindi NULL
      // Per last_updated_from_source, se non è definito in PlayerSeedObject,
      // allora forniamo direttamente il default.
      // Se fosse opzionale in PlayerSeedObject (es. last_updated_from_source?: number),
      // allora useremmo: currentPlayer.last_updated_from_source ?? (now - 86400 * 7)
      last_updated_from_source: now - 86400 * 7,
      created_at: now,
      updated_at: now,
    });
  }
  console.log(`${playersToSeed.length} players seeded.`);

  // 5.3. Inserisci Leghe
  const insertLeagueStmt = db.prepare(`
    INSERT INTO auction_leagues (
      name, league_type, initial_budget_per_manager, status, admin_creator_id,
      active_auction_roles, draft_window_start, draft_window_end,
      slots_P, slots_D, slots_C, slots_A, min_bid, timer_duration_hours,
      config_json, created_at, updated_at
    ) VALUES (
      @name, @league_type, @initial_budget_per_manager, @status, @admin_creator_id,
      @active_auction_roles, @draft_window_start, @draft_window_end,
      @slots_P, @slots_D, @slots_C, @slots_A, @min_bid, @timer_duration_hours,
      @config_json, @created_at, @updated_at
    )
  `);
  console.log("Seeding auction leagues...");
  let seededLeagueId: number | undefined;
  if (leaguesToSeed.length > 0) {
    const league = leaguesToSeed[0]; // Assumiamo di voler usare la prima lega per i test specifici
    const info = insertLeagueStmt.run({
      ...league,
      created_at: now,
      updated_at: now,
    });
    seededLeagueId = info.lastInsertRowid as number;
    console.log(`Seeded league "${league.name}" with ID: ${seededLeagueId}`);
  } else {
    console.log(
      "No leagues to seed. Skipping participant enrollment and test auctions."
    );
  }

  // 5.4. Iscrivi Manager alla Lega di Test (se una lega è stata creata)
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
        `Could not find league with ID ${seededLeagueId} to retrieve budget for participants.`
      );
    } else {
      const initialBudget = leagueForBudget.initial_budget_per_manager;
      const managersToEnroll = usersToSeed.filter((u) => u.role === "manager");
      const enrollManagerStmt = db.prepare(`
        INSERT OR IGNORE INTO league_participants (
          league_id, user_id, current_budget, locked_credits,
          players_P_acquired, players_D_acquired, players_C_acquired, players_A_acquired,
          joined_at, updated_at
        ) VALUES (
          @league_id, @user_id, @current_budget, 0, 0, 0, 0, 0, @joined_at, @updated_at
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
          updated_at: now,
        });
      }
      console.log("Managers enrolled.");

      // 5.5. Inserisci Aste di Test (una scaduta, una attiva) - SOLO se la lega è stata creata
      const oneHourAgo = now - 3600;
      const oneDayInFuture = now + 24 * 3600;
      const testPlayerIdForExpiredAuction = 572; // Meret (P)
      const testPlayerIdForActiveAuction = 1001; // Portiere Alpha (P)
      const testWinningManagerId = usersToSeed.find(
        (u) => u.username === "auctiontester"
      )?.id; // user_2vultw8Mzhm6PZDOuiMHtd2IPJ3
      const anotherManagerId = usersToSeed.find(
        (u) => u.username === "managerone"
      )?.id; // user_2yAf7DnJ7asI88hIP03WtYnzxDL

      if (testWinningManagerId && anotherManagerId) {
        const expiredAuctionData = {
          auction_league_id: seededLeagueId,
          player_id: testPlayerIdForExpiredAuction,
          start_time: oneHourAgo - 24 * 3600,
          scheduled_end_time: oneHourAgo, // SCADUTA
          current_highest_bid_amount: 10,
          current_highest_bidder_id: testWinningManagerId,
          status: "active",
          created_at: oneHourAgo - 24 * 3600,
          updatedAt: oneHourAgo,
        };
        const activeAuctionData = {
          auction_league_id: seededLeagueId,
          player_id: testPlayerIdForActiveAuction,
          start_time: now - 3600,
          scheduled_end_time: oneDayInFuture, // NON SCADUTA
          current_highest_bid_amount: 15,
          current_highest_bidder_id: anotherManagerId,
          status: "active",
          created_at: now - 3600,
          updatedAt: now - 3600,
        };

        const insertAuctionStmt = db.prepare(
          `INSERT INTO auctions (auction_league_id, player_id, start_time, scheduled_end_time, current_highest_bid_amount, current_highest_bidder_id, status, created_at, updated_at)
           VALUES (@auction_league_id, @player_id, @start_time, @scheduled_end_time, @current_highest_bid_amount, @current_highest_bidder_id, @status, @created_at, @updatedAt)`
        );
        const insertBidStmt = db.prepare(
          `INSERT INTO bids (auction_id, user_id, amount, bid_time, bid_type) VALUES (?, ?, ?, ?, ?)`
        );

        // Inserisci asta scaduta
        try {
          const expiredInfo = insertAuctionStmt.run(expiredAuctionData);
          console.log(
            `[SEED] Seeded expired auction ID: ${expiredInfo.lastInsertRowid} for player ${testPlayerIdForExpiredAuction}`
          );
          insertBidStmt.run(
            expiredInfo.lastInsertRowid,
            testWinningManagerId,
            expiredAuctionData.current_highest_bid_amount,
            expiredAuctionData.start_time,
            "manual"
          );
          console.log(
            `[SEED] Seeded initial bid for expired auction ID: ${expiredInfo.lastInsertRowid}`
          );
        } catch (e: unknown) {
          // CORREZIONE TIPO ERRORE
          const baseMessage = `[SEED] Error seeding expired auction for player ${testPlayerIdForExpiredAuction}:`;
          if (e instanceof Error) {
            if (e.message.includes("UNIQUE constraint failed")) {
              console.warn(
                `${baseMessage} Auction might already exist or UNIQUE constraint violation.`
              );
            } else {
              console.error(baseMessage, e.message, e);
            }
          } else {
            console.error(baseMessage, "Unknown error structure.", e);
          }
        }

        // Inserisci asta attiva
        try {
          const activeInfo = insertAuctionStmt.run(activeAuctionData);
          console.log(
            `[SEED] Seeded active auction ID: ${activeInfo.lastInsertRowid} for player ${testPlayerIdForActiveAuction}`
          );
          insertBidStmt.run(
            activeInfo.lastInsertRowid,
            anotherManagerId,
            activeAuctionData.current_highest_bid_amount,
            activeAuctionData.start_time,
            "manual"
          );
          console.log(
            `[SEED] Seeded initial bid for active auction ID: ${activeInfo.lastInsertRowid}`
          );
          // Linea originale (o simile che causa l'errore): } catch (e: any) {
          // Riga ~182 (la riga esatta può variare leggermente nel tuo file)
        } catch (e: unknown) {
          const baseMessage = `[SEED] Error seeding active auction for player ${testPlayerIdForActiveAuction}:`;
          if (e instanceof Error) {
            if (e.message.includes("UNIQUE constraint failed")) {
              // Questo controllo va bene se e è di tipo Error
              console.warn(
                `${baseMessage} Auction might already exist or UNIQUE constraint violation.`
              );
            } else {
              console.error(baseMessage, e.message, e); // Qui e.message è sicuro
            }
          } else {
            console.error(baseMessage, "Unknown error structure.", e); // e qui non si usa e.message
          }
        }
      } else {
        console.warn(
          "[SEED] Could not find test managers for seeding auctions."
        );
      }
    }
  } else {
    console.log(
      "[SEED] Skipping manager enrollment and test auction seeding as no league was created."
    );
  }
  console.log("Database seeding completed.");
}

// 6. Esecuzione dello Script
seedDatabase()
  .catch((err: unknown) => {
    // CORREZIONE TIPO ERRORE
    console.error(
      "Error during seeding process:",
      err instanceof Error ? err.message : "Unknown error",
      err
    );
    process.exit(1);
  })
  .finally(() => {
    if (db && db.open) {
      closeDbConnection();
      console.log("Database connection closed by seed script.");
    }
  });
