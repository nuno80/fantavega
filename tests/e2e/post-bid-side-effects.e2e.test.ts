import { beforeEach, describe, expect, it, vi } from "vitest";

const cancelResponseTimer = vi.fn();
const createResponseTimer = vi.fn();
const setUserAuctionState = vi.fn();

vi.mock("@/lib/db/services/response-timer.service", () => ({ cancelResponseTimer, createResponseTimer }));
vi.mock("@/lib/db/services/auction-states.service", () => ({ setUserAuctionState }));

describe("post-bid timer and state coordination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cancelResponseTimer.mockResolvedValue(undefined);
    createResponseTimer.mockResolvedValue(undefined);
    setUserAuctionState.mockResolvedValue(undefined);
  });

  it("waits for timer and state operations while isolating failures", async () => {
    createResponseTimer.mockRejectedValueOnce(new Error("socket unavailable"));
    const { applyPostBidSideEffects } = await import("@/lib/db/services/post-bid-side-effects.service");
    const results = await applyPostBidSideEffects({ auctionId: 7, previousBidderId: "old", newBidderId: "new", userId: "new" });
    expect(results).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(cancelResponseTimer).toHaveBeenCalledWith(7, "new");
    expect(setUserAuctionState).toHaveBeenCalledWith(7, "old", "rilancio_possibile");
  });

  it("does not create a response timer when there is no previous bidder", async () => {
    const { applyPostBidSideEffects } = await import("@/lib/db/services/post-bid-side-effects.service");
    const results = await applyPostBidSideEffects({ auctionId: 7, previousBidderId: null, newBidderId: "new", userId: "new" });
    expect(results).toHaveLength(1);
    expect(createResponseTimer).not.toHaveBeenCalled();
    expect(setUserAuctionState).not.toHaveBeenCalled();
  });
});
