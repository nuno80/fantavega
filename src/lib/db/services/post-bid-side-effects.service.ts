import { createResponseTimer, cancelResponseTimer } from "./response-timer.service";
import { setUserAuctionState } from "./auction-states.service";

export interface PostBidSideEffectParams {
  auctionId: number;
  previousBidderId: string | null;
  newBidderId: string;
  userId: string;
}

/**
 * Persists timer and bidder-state side effects together from the caller's
 * perspective. Each operation is isolated so a notification/compliance
 * failure cannot affect bid persistence.
 */
export async function applyPostBidSideEffects({
  auctionId,
  previousBidderId,
  newBidderId,
  userId,
}: PostBidSideEffectParams): Promise<PromiseSettledResult<void>[]> {
  const effects: Promise<void>[] = [];

  effects.push(cancelResponseTimer(auctionId, userId));

  if (previousBidderId && previousBidderId !== newBidderId) {
    effects.push(setUserAuctionState(auctionId, previousBidderId, "rilancio_possibile"));
    effects.push(createResponseTimer(auctionId, previousBidderId));
  }

  return Promise.allSettled(effects);
}
