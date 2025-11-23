// src/lib/db/services/admin.service.ts v.2.0 (Async Turso Migration)
// Servizio per le funzioni di business legate al pannello di amministrazione.
// 1. Importazioni
import { db } from "@/lib/db";

// 2. Tipi di Ritorno per le Statistiche
export interface DashboardStats {
  totalUsers: number;
  totalLeagues: number;
  activeAuctions: number;
  // Aggiungeremo altre statistiche qui in futuro, se necessario.
}

// 3. Funzione per Recuperare le Statistiche della Dashboard
/**
 * Recupera le statistiche aggregate principali per la dashboard dell'admin.
 * Esegue tre query di conteggio separate.
 * @returns Un oggetto DashboardStats con i totali.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Query per contare tutti gli utenti registrati
    const usersResult = await db.execute({
      sql: "SELECT COUNT(id) as count FROM users",
      args: [],
    });
    const totalUsers = Number(usersResult.rows[0].count);

    // Query per contare tutte le leghe create
    const leaguesResult = await db.execute({
      sql: "SELECT COUNT(id) as count FROM auction_leagues",
      args: [],
    });
    const totalLeagues = Number(leaguesResult.rows[0].count);

    // Query per contare solo le aste attualmente attive
    const auctionsResult = await db.execute({
      sql: "SELECT COUNT(id) as count FROM auctions WHERE status = 'active'",
      args: [],
    });
    const activeAuctions = Number(auctionsResult.rows[0].count);

    // Ritorna l'oggetto con tutte le statistiche
    return {
      totalUsers,
      totalLeagues,
      activeAuctions,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    // In caso di errore, ritorna valori di default per non rompere la UI
    return {
      totalUsers: 0,
      totalLeagues: 0,
      activeAuctions: 0,
    };
  }
}
