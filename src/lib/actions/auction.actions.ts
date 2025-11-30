"use server";

import {
  getAuctionStatusForPlayer,
  placeBidOnExistingAuction,
  placeInitialBidAndCreateAuction,
} from "@/lib/db/services/bid.service";
import { abandonAuction, markTimerCompleted } from "@/lib/db/services/response-timer.service";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export type ActionResponse = {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
};

/**
 * Starts a new auction for a player or places a bid on existing auction.
 * This action handles both cases automatically.
 */
export async function placeBidAction(
  leagueId: number,
  playerId: number,
  amount: number,
  bidType: "manual" | "quick" = "manual",
  maxAmount?: number
): Promise<ActionResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    console.log(`[ACTION] placeBid: User ${userId} bidding on player ${playerId} in league ${leagueId}`);

    // Check if auction exists
    const existingAuction = await getAuctionStatusForPlayer(leagueId, playerId);

    let result;
    if (existingAuction && (existingAuction.status === "active" || existingAuction.status === "closing")) {
      // Bid on existing auction
      console.log(`[ACTION] Placing bid on existing auction ${existingAuction.id}`);
      result = await placeBidOnExistingAuction({
        leagueId,
        playerId,
        userId,
        bidAmount: amount,
        bidType,
        autoBidMaxAmount: maxAmount,
      });

      // Mark timer as completed if it exists
      await markTimerCompleted(existingAuction.id, userId);
    } else {
      // Create new auction
      console.log(`[ACTION] Creating new auction for player ${playerId}`);
      result = await placeInitialBidAndCreateAuction(
        leagueId,
        playerId,
        userId,
        amount,
        maxAmount
      );
    }

    revalidatePath("/auctions");
    return { success: true, data: result };
  } catch (error: unknown) {
    console.error("[ACTION] placeBid Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to place bid";
    return { success: false, error: errorMessage };
  }
}

/**
 * Abandons an auction (fold).
 */
export async function abandonAuctionAction(
  leagueId: number,
  playerId: number
): Promise<ActionResponse> {
  try {
    const { userId } = await auth();
    if (!userId) {
      return { success: false, error: "Unauthorized" };
    }

    console.log(`[ACTION] abandonAuction: User ${userId} abandoning auction for player ${playerId}`);

    // Call the service to abandon the auction
    await abandonAuction(userId, leagueId, playerId);

    revalidatePath("/auctions");
    return { success: true, message: "Asta abbandonata con successo" };
  } catch (error: unknown) {
    console.error("[ACTION] abandonAuction Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to abandon auction";
    return { success: false, error: errorMessage };
  }
}
