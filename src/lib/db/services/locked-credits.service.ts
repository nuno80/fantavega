// src/lib/db/services/locked-credits.service.ts
// Servizio centralizzato per il ricalcolo di league_participants.locked_credits.
// La query total_locked vive SOLO qui: auto-bid attivi su aste active/closing
// + offerte manuali vincenti (senza auto-bid) su aste active/closing.
import { db } from "@/lib/db";

// Accetta sia db che una transazione (stesso pattern di checkSlotsAndBudgetOrThrow)
export type ExecuteClient = Pick<typeof db, "execute">;

const TOTAL_LOCKED_SQL = `
  SELECT
    COALESCE(
      (SELECT SUM(ab.max_amount)
       FROM auto_bids ab
       JOIN auctions a ON ab.auction_id = a.id
       WHERE a.auction_league_id = ? AND ab.user_id = ? AND ab.is_active = TRUE AND a.status IN ('active', 'closing')),
      0
    ) +
    COALESCE(
      (SELECT SUM(a.current_highest_bid_amount)
       FROM auctions a
       LEFT JOIN auto_bids ab ON ab.auction_id = a.id AND ab.user_id = ? AND ab.is_active = TRUE
       WHERE a.auction_league_id = ? AND a.current_highest_bidder_id = ?
         AND ab.id IS NULL
         AND a.status IN ('active', 'closing')),
      0
    ) as total_locked
`;

/**
 * Ricalcola locked_credits per un singolo utente nella transazione del chiamante,
 * aggiorna league_participants e restituisce il nuovo valore.
 */
export const recalculateLockedCreditsForUser = async (
  client: ExecuteClient,
  leagueId: number,
  userId: string
): Promise<number> => {
  const result = await client.execute({
    sql: TOTAL_LOCKED_SQL,
    args: [leagueId, userId, userId, leagueId, userId],
  });
  const totalLocked =
    ((result.rows[0] as unknown as { total_locked: number }).total_locked) || 0;

  await client.execute({
    sql: "UPDATE league_participants SET locked_credits = ? WHERE user_id = ? AND league_id = ?",
    args: [totalLocked, userId, leagueId],
  });

  return totalLocked;
};

/**
 * Ricalcola locked_credits per più utenti nella transazione del chiamante,
 * deduplicando gli id, e restituisce userId -> nuovo valore.
 */
export const recalculateLockedCreditsForUsers = async (
  client: ExecuteClient,
  leagueId: number,
  userIds: Iterable<string>
): Promise<Map<string, number>> => {
  const uniqueUserIds = new Set(userIds);
  const results = new Map<string, number>();

  for (const userId of uniqueUserIds) {
    results.set(userId, await recalculateLockedCreditsForUser(client, leagueId, userId));
  }

  return results;
};
