import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/lib/db", () => ({ db: { execute } }));
vi.mock("@/lib/socket-emitter", () => ({ notifySocketServer: vi.fn() }));
vi.mock("@/lib/db/services/session.service", () => ({ getUserLastLogin: vi.fn() }));

describe("cooldown checks", () => {
  beforeEach(() => vi.resetAllMocks());

  it("denies bidding when the cooldown query fails", async () => {
    execute.mockRejectedValueOnce(new Error("database unavailable"));
    const { canUserBidOnPlayer } = await import("./response-timer.service");
    await expect(canUserBidOnPlayer("user-a", 10, 7)).resolves.toBe(false);
  });

  it("returns a safe retry response when cooldown lookup fails", async () => {
    execute.mockRejectedValueOnce(new Error("database unavailable"));
    const { getUserCooldownInfo } = await import("./response-timer.service");
    await expect(getUserCooldownInfo("user-a", 10, 7)).resolves.toEqual({ canBid: false, message: "Impossibile verificare il cooldown. Riprova tra poco." });
  });
});
