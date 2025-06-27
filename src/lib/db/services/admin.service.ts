// src/lib/db/services/admin.service.ts v.1.0
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
    const usersCountStmt = db.prepare("SELECT COUNT(id) as count FROM users");
    const totalUsers = (usersCountStmt.get() as { count: number }).count;

    // Query per contare tutte le leghe create
    const leaguesCountStmt = db.prepare(
      "SELECT COUNT(id) as count FROM auction_leagues"
    );
    const totalLeagues = (leaguesCountStmt.get() as { count: number }).count;

    // Query per contare solo le aste attualmente attive
    const activeAuctionsCountStmt = db.prepare(
      "SELECT COUNT(id) as count FROM auctions WHERE status = 'active'"
    );
    const activeAuctions = (activeAuctionsCountStmt.get() as { count: number })
      .count;

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
