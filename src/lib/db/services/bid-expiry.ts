// src/lib/db/services/bid-expiry.ts
// Logica di chiusura aste scadute e assegnazione giocatori.
// Import diretti (no barrel) per evitare cicli di import.
import { db } from "@/lib/db";
import { notifySocketServer } from "@/lib/socket-emitter";
import { recalculateLockedCreditsForUsers } from "./locked-credits.service";
import { checkAndRecordCompliance } from "./penalty.service";
import {
  mapRow,
  requiredNumber,
  requiredString,
  type RowShape,
} from "./db-mappers";
import { withRetry } from "./retry-utils";

export interface ExpiredAuctionData {
  id: number;
  auction_league_id: number;
  player_id: number;
  current_highest_bid_amount: number;
  current_highest_bidder_id: string;
  player_role: string;
  player_name?: string;
}

const mapExpiredAuctionData = (r: RowShape): ExpiredAuctionData => ({
  id: requiredNumber(r, "id"),
  auction_league_id: requiredNumber(r, "auction_league_id"),
  player_id: requiredNumber(r, "player_id"),
  current_highest_bid_amount: requiredNumber(r, "current_highest_bid_amount"),
  current_highest_bidder_id: requiredString(r, "current_highest_bidder_id"),
  player_role: requiredString(r, "player_role"),
  player_name: r.player_name === null || r.player_name === undefined
    ? undefined
    : requiredString(r, "player_name"),
});

// Funzione helper per processare un vincitore d'asta
async function processAuctionWinner(
  auction: ExpiredAuctionData,
  now: number
): Promise<boolean> {
  try {
    // Determina l'importo corretto da sbloccare
    const autoBidResult = await db.execute({
      sql: "SELECT max_amount FROM auto_bids WHERE auction_id = ? AND user_id = ? AND is_active = TRUE",
      args: [auction.id, auction.current_highest_bidder_id],
    });
    const autoBidRow = mapRow(autoBidResult.rows[0] as RowShape);
    // const amountToUnlock = autoBid?.max_amount || auction.current_highest_bid_amount;

    const tx = await db.transaction("write");
    try {
      await tx.execute({
        sql: "UPDATE auctions SET status = 'sold', updated_at = ? WHERE id = ?",
        args: [now, auction.id],
      });

      // Disattiva TUTTI gli auto-bid per questa asta
      await tx.execute({
        sql: "UPDATE auto_bids SET is_active = FALSE, updated_at = ? WHERE auction_id = ?",
        args: [now, auction.id],
      });

      // Sblocca i crediti per tutti gli utenti che avevano auto-bid attivi (eccetto il vincitore)
      const allAutoBidsResult = await tx.execute({
        sql: "SELECT user_id, max_amount FROM auto_bids WHERE auction_id = ? AND user_id != ? AND is_active = TRUE",
        args: [auction.id, auction.current_highest_bidder_id],
      });
      const allAutoBidsForAuction = (
        allAutoBidsResult.rows as RowShape[]
      ).map((r) => ({
        user_id: requiredString(r, "user_id"),
        max_amount: requiredNumber(r, "max_amount"),
      }));

      const affectedUsers = new Set<string>();
      for (const otherAutoBid of allAutoBidsForAuction) {
        affectedUsers.add(otherAutoBid.user_id);
      }
      affectedUsers.add(auction.current_highest_bidder_id);

      await recalculateLockedCreditsForUsers(
        tx,
        auction.auction_league_id,
        affectedUsers
      );

      // Deduce il prezzo di acquisto dal budget del vincitore
      await tx.execute({
        sql: "UPDATE league_participants SET current_budget = current_budget - ? WHERE league_id = ? AND user_id = ?",
        args: [
          auction.current_highest_bid_amount,
          auction.auction_league_id,
          auction.current_highest_bidder_id,
        ],
      });

      const newBalanceResult = await tx.execute({
        sql: "SELECT current_budget FROM league_participants WHERE league_id = ? AND user_id = ?",
        args: [auction.auction_league_id, auction.current_highest_bidder_id],
      });
      const newBalanceRow = mapRow(newBalanceResult.rows[0] as RowShape);
      if (!newBalanceRow) {
        throw new Error(
          `Budget non trovato per l'utente ${auction.current_highest_bidder_id} nella lega ${auction.auction_league_id}`
        );
      }
      const newBalance = {
        current_budget: requiredNumber(newBalanceRow, "current_budget"),
      };

      await tx.execute({
        sql: `INSERT INTO budget_transactions (auction_league_id, user_id, transaction_type, amount, balance_after_in_league, description) VALUES (?, ?, 'win_auction_debit', ?, ?, ?)`,
        args: [
          auction.auction_league_id,
          auction.current_highest_bidder_id,
          -auction.current_highest_bid_amount, // Negative amount for purchase
          newBalance.current_budget,
          `Acquisto di ${auction.player_name || "giocatore"} (${auction.player_role})`,
        ],
      });

      // Assegna il giocatore
      await tx.execute({
        sql: `INSERT INTO player_assignments (auction_league_id, user_id, player_id, purchase_price, assigned_at) VALUES (?, ?, ?, ?, ?)`,
        args: [
          auction.auction_league_id,
          auction.current_highest_bidder_id,
          auction.player_id,
          auction.current_highest_bid_amount,
          now,
        ],
      });

      await tx.commit();

      // Trigger compliance check (fire-and-forget inside this flow usually, but we await to ensure order in cron)
      // Retry sicuro: checkAndRecordCompliance è idempotente (SELECT + UPDATE guardato + PK (league,user,phase))
      void withRetry(() =>
        checkAndRecordCompliance(
          auction.current_highest_bidder_id,
          auction.auction_league_id,
          false
        )
      ).catch((err) => console.error("Compliance check error:", err));

      // Notifica fire-and-forget
      notifySocketServer({
        room: `league-${auction.auction_league_id}`,
        event: "auction-closed",
        data: {
          auctionId: auction.id,
          playerId: auction.player_id,
          winnerId: auction.current_highest_bidder_id,
          amount: auction.current_highest_bid_amount,
          playerName: auction.player_name,
          playerRole: auction.player_role,
        },
      }).catch((err) => console.error("Error sending socket notification:", err));

      return true;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (err) {
    console.error(`Error processing auction ${auction.id}:`, err);
    return false;
  }
}

const BATCH_SIZE = 50;

export const processExpiredAuctionsAndAssignPlayers = async (): Promise<{
  processedCount: number;
  failedCount: number;
  errors: string[];
}> => {
  const now = Math.floor(Date.now() / 1000);
  const getExpiredAuctionsResult = await db.execute({
    sql: `SELECT a.id, a.auction_league_id, a.player_id, a.current_highest_bid_amount, a.current_highest_bidder_id, p.role as player_role, p.name as player_name FROM auctions a JOIN players p ON a.player_id = p.id WHERE a.status = 'active' AND a.scheduled_end_time <= ? AND a.current_highest_bidder_id IS NOT NULL AND a.current_highest_bid_amount > 0 ORDER BY a.scheduled_end_time ASC LIMIT ?`,
    args: [now, BATCH_SIZE],
  });
  const expiredAuctions = (
    getExpiredAuctionsResult.rows as RowShape[]
  ).map(mapExpiredAuctionData);

  if (expiredAuctions.length === 0)
    return { processedCount: 0, failedCount: 0, errors: [] };

  if (expiredAuctions.length === BATCH_SIZE) {
    console.log(
      `[BID_SERVICE] Batch pieno (${BATCH_SIZE} aste scadute): ci potrebbero essere altre aste da processare nella prossima invocazione.`
    );
  }

  let processedCount = 0,
    failedCount = 0;
  const errors: string[] = [];

  for (const auction of expiredAuctions) {
    const success = await processAuctionWinner(auction, now);
    if (success) {
      processedCount++;
    } else {
      failedCount++;
      errors.push(`Failed to process auction ${auction.id}`);
    }
  }

  return { processedCount, failedCount, errors };
};

export const closeAllActiveAuctionsForLeague = async (leagueId: number) => {
  const now = Math.floor(Date.now() / 1000);
  console.log(`[BID_SERVICE] Closing all active auctions for league ${leagueId}`);

  // 1. Bulk Close auctions with NO bids (optimized)
  const bulkUpdateResult = await db.execute({
    sql: `UPDATE auctions SET status = 'closed', updated_at = ? WHERE auction_league_id = ? AND status IN ('active', 'closing') AND current_highest_bidder_id IS NULL`,
    args: [now, leagueId],
  });
  console.log(
    `[BID_SERVICE] Bulk closed ${bulkUpdateResult.rowsAffected} no-bid auctions.`
  );

  // 2. Fetch active auctions WITH winners
  const winnersResult = await db.execute({
    sql: `SELECT a.id, a.auction_league_id, a.player_id, a.current_highest_bid_amount, a.current_highest_bidder_id, p.role as player_role, p.name as player_name
          FROM auctions a
          JOIN players p ON a.player_id = p.id
          WHERE a.auction_league_id = ? AND a.status IN ('active', 'closing') AND a.current_highest_bidder_id IS NOT NULL`,
    args: [leagueId],
  });
  const winningAuctions = (
    winnersResult.rows as RowShape[]
  ).map(mapExpiredAuctionData);

  console.log(
    `[BID_SERVICE] Processing ${winningAuctions.length} active auctions with winners...`
  );

  // 3. Process winners efficiently
  for (const auction of winningAuctions) {
    // We await here to ensure data consistency during league status transition
    await processAuctionWinner(auction, now);
  }

  console.log(`[BID_SERVICE] All active auctions processed for league ${leagueId}.`);
};
