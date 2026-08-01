// src/lib/db/services/__tests__/bid-battle.test.ts
// Suite di caratterizzazione per simulateAutoBidBattle() — blocca il comportamento
// attuale prima del refactor (issue 02). NON cambiare i test insieme all'algoritmo:
// se il comportamento atteso cambia, aggiornare qui in modo esplicito e deliberato.
import { describe, expect, it, vi } from "vitest";

// Mock dei moduli con side-effect: il test esercita solo la funzione pura
// simulateAutoBidBattle, non l'accesso al database.
vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn() },
}));
vi.mock("@/lib/socket-emitter", () => ({
  notifySocketServer: vi.fn().mockResolvedValue(undefined),
}));

import {
  simulateAutoBidBattle,
  type AutoBidBattleParticipant,
} from "../bid.service";

const makeParticipant = (
  userId: string,
  maxAmount: number,
  createdAt: number,
  isActive = true
): AutoBidBattleParticipant => ({ userId, maxAmount, createdAt, isActive });

describe("simulateAutoBidBattle — caratterizzazione", () => {
  describe("nessun auto-bid competitivo", () => {
    it("vince l'offerta manuale quando nessun auto-bid ha maxAmount >= offerta", () => {
      const autoBids = [makeParticipant("u2", 90, 100), makeParticipant("u3", 80, 200)];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalAmount).toBe(100);
      expect(result.finalBidderId).toBe("u1");
      expect(result.initialBidderHadWinningManualBid).toBe(true);
      expect(result.totalSteps).toBe(1);
      expect(result.battleSteps).toEqual([
        { bidAmount: 100, bidderId: "u1", isAutoBid: false, step: 0 },
      ]);
    });
  });

  describe("un auto-bid", () => {
    it("l'unico auto-bid paga min(offerta + 1, maxAmount)", () => {
      const autoBids = [makeParticipant("u2", 150, 100)];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalAmount).toBe(101);
      expect(result.finalBidderId).toBe("u2");
      expect(result.initialBidderHadWinningManualBid).toBe(false);
      expect(result.totalSteps).toBe(2);
      expect(result.battleSteps).toEqual([
        { bidAmount: 100, bidderId: "u1", isAutoBid: false, step: 0 },
        { bidAmount: 101, bidderId: "u2", isAutoBid: true, step: 1 },
      ]);
    });

    it("paga il suo maxAmount quando offerta + 1 supera il massimale", () => {
      const autoBids = [makeParticipant("u2", 100, 100)];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalAmount).toBe(100);
      expect(result.finalBidderId).toBe("u2");
    });
  });

  describe("due auto-bid con massimali diversi", () => {
    it("vince il massimale più alto pagando 1 credito in più del secondo", () => {
      const autoBids = [
        makeParticipant("u2", 120, 100),
        makeParticipant("u3", 200, 50),
      ];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u3");
      expect(result.finalAmount).toBe(121);
      expect(result.initialBidderHadWinningManualBid).toBe(false);
      expect(result.battleSteps).toEqual([
        { bidAmount: 100, bidderId: "u1", isAutoBid: false, step: 0 },
        { bidAmount: 121, bidderId: "u3", isAutoBid: true, step: 1 },
      ]);
    });

    it("paga il maxAmount del vincitore quando il secondo massimale + 1 raggiunge il massimo", () => {
      const autoBids = [
        makeParticipant("u2", 199, 100),
        makeParticipant("u3", 200, 50),
      ];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u3");
      expect(result.finalAmount).toBe(200);
    });
  });

  describe("due auto-bid con stesso massimale", () => {
    it("vince il primo per createdAt e paga il massimale pieno (parità)", () => {
      const autoBids = [
        makeParticipant("u2", 150, 100),
        makeParticipant("u3", 150, 200),
      ];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u2");
      expect(result.finalAmount).toBe(150);
      expect(result.initialBidderHadWinningManualBid).toBe(false);
    });
  });

  describe("stesso massimale con timestamp diversi", () => {
    it("a parità di maxAmount vince chi ha createdAt precedente", () => {
      const autoBids = [
        makeParticipant("u2", 150, 200),
        makeParticipant("u3", 150, 100),
      ];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u3");
      expect(result.finalAmount).toBe(150);
    });
  });

  describe("auto-bid dell'offerente iniziale", () => {
    it("l'auto-bid dell'offerente manuale può competere e vincere", () => {
      const autoBids = [makeParticipant("u1", 130, 100)];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u1");
      expect(result.finalAmount).toBe(101);
      expect(result.initialBidderHadWinningManualBid).toBe(false);
    });

    it("perde contro un altro auto-bid con massimale maggiore", () => {
      const autoBids = [
        makeParticipant("u1", 130, 100),
        makeParticipant("u2", 140, 50),
      ];

      const result = simulateAutoBidBattle(100, "u1", autoBids);

      expect(result.finalBidderId).toBe("u2");
      expect(result.finalAmount).toBe(131);
    });
  });

  describe("array vuoto", () => {
    it("vince l'offerta manuale senza step aggiuntivi", () => {
      const result = simulateAutoBidBattle(100, "u1", []);

      expect(result.finalAmount).toBe(100);
      expect(result.finalBidderId).toBe("u1");
      expect(result.initialBidderHadWinningManualBid).toBe(true);
      expect(result.totalSteps).toBe(1);
      expect(result.battleSteps).toEqual([
        { bidAmount: 100, bidderId: "u1", isAutoBid: false, step: 0 },
      ]);
    });
  });

  describe("effetto collaterale su isActive (input mutato)", () => {
    it("documenta il comportamento attuale: l'algoritmo MUTA isActive dei partecipanti", () => {
      const autoBids = [makeParticipant("u2", 150, 100, false)];

      simulateAutoBidBattle(100, "u1", autoBids);

      // Comportamento attuale da documentare: la funzione forza isActive = true
      // su tutti i partecipanti ricevuti (riga `autoBids.forEach((ab) => (ab.isActive = true))`).
      // Qualsiasi refactor DEVE preservare questo effetto collaterale o aggiornare questo test.
      expect(autoBids[0].isActive).toBe(true);
    });
  });
});
