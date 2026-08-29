// src/lib/db/services/__tests__/auto-bid-battle.test.ts
// STEP-6: test di regressione per la logica pura della battaglia auto-bid.
// Money path a rischio più alto: nessun auto-bid, parità, prezzo eBay, e
// immutabilità degli input (STEP-4.3).
import { describe, expect, it } from "vitest";

import { simulateAutoBidBattle } from "../auto-bid-battle";

const ab = (
  userId: string,
  maxAmount: number,
  createdAt: number,
): {
  userId: string;
  maxAmount: number;
  createdAt: number;
  isActive: boolean;
} => ({ userId, maxAmount, createdAt, isActive: true });

describe("simulateAutoBidBattle", () => {
  it("nessun auto-bid competitore → vince la manuale al prezzo corrente", () => {
    const result = simulateAutoBidBattle(30, "user_a", [ab("user_b", 25, 100)]);

    expect(result.finalAmount).toBe(30);
    expect(result.finalBidderId).toBe("user_a");
    expect(result.initialBidderHadWinningManualBid).toBe(true);
  });

  it("parità max_amount → vince il più vecchio per createdAt, paga il max", () => {
    const result = simulateAutoBidBattle(20, "user_a", [
      ab("user_b", 50, 200), // più recente
      ab("user_c", 50, 100), // più vecchio → vince
    ]);

    expect(result.finalBidderId).toBe("user_c");
    expect(result.finalAmount).toBe(50);
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });

  it("secondo migliore → vincitore paga min(secondBest+1, max)", () => {
    const result = simulateAutoBidBattle(20, "user_a", [
      ab("user_b", 80, 100),
      ab("user_c", 45, 200),
    ]);

    expect(result.finalBidderId).toBe("user_b");
    expect(result.finalAmount).toBe(46); // 45 + 1
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });

  it("secondo migliore che supererebbe il max → paga il proprio max", () => {
    const result = simulateAutoBidBattle(20, "user_a", [
      ab("user_b", 40, 100),
      ab("user_c", 50, 200),
    ]);

    expect(result.finalBidderId).toBe("user_c");
    expect(result.finalAmount).toBe(41); // min(40+1, 50)
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });

  it("auto-bid singolo → paga min(manuale+1, max)", () => {
    const result = simulateAutoBidBattle(30, "user_a", [
      ab("user_b", 60, 100),
    ]);

    expect(result.finalBidderId).toBe("user_b");
    expect(result.finalAmount).toBe(31); // 30 + 1
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });

  it("auto-bid singolo col max sotto manuale+1 → paga il proprio max", () => {
    const result = simulateAutoBidBattle(30, "user_a", [
      ab("user_b", 30, 100), // max == manuale: pareggia ma >= currentBid
    ]);

    expect(result.finalBidderId).toBe("user_b");
    expect(result.finalAmount).toBe(30); // min(30+1, 30)
    expect(result.initialBidderHadWinningManualBid).toBe(false);
  });

  it("non muta gli input (STEP-4.3): isActive e ordine preservati", () => {
    const autoBids = [
      ab("user_b", 40, 100),
      ab("user_c", 60, 200),
    ];

    simulateAutoBidBattle(20, "user_a", autoBids);

    expect(autoBids.map((b) => b.isActive)).toEqual([true, true]);
    expect(autoBids.map((b) => b.userId)).toEqual(["user_b", "user_c"]);
  });
});
