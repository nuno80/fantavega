// src/lib/db/services/auto-bid-battle.ts
// Logica pura della battaglia auto-bid (nessun side-effect, nessun I/O).
// Estratta da bid.service.ts in STEP-3/6 per renderla importabile senza DB.
import { logger } from "@/lib/logger";

export interface AutoBidBattleParticipant {
  userId: string;
  maxAmount: number;
  createdAt: number; // Usato per la priorità
  isActive: boolean; // Per tracciare se l'auto-bid ha raggiunto il suo massimo
}

export interface BattleStep {
  bidAmount: number;
  bidderId: string;
  isAutoBid: boolean;
  step: number;
}

export interface BattleResult {
  finalAmount: number;
  finalBidderId: string;
  battleSteps: BattleStep[];
  totalSteps: number;
  initialBidderHadWinningManualBid: boolean;
}

/**
 * Simula la battaglia tra l'offerta manuale iniziale e gli auto-bid attivi.
 * Pura: non muta gli input e non tocca il database.
 *
 * Regole (logica eBay):
 * - Nessun auto-bid competitore (max < offerta manuale) → vince la manuale.
 * - Parità di max_amount → vince il più vecchio per createdAt, paga il max.
 * - Vincitore paga `min(secondBest + 1, proprio max)`.
 * - Auto-bid singolo → paga `min(manuale + 1, max)`.
 */
export function simulateAutoBidBattle(
  initialBid: number,
  initialBidderId: string,
  autoBids: AutoBidBattleParticipant[],
): BattleResult {
  const currentBid = initialBid;
  const currentBidderId = initialBidderId;
  const battleSteps: BattleStep[] = [];
  let step = 0;

  // Aggiungi il bid manuale iniziale come primo step
  battleSteps.push({
    bidAmount: currentBid,
    bidderId: currentBidderId,
    isAutoBid: false,
    step: step++,
  });

  // STEP-4.3: non mutare gli input del chiamante — lavora su una copia.
  // CORREZIONE: Controlla se ci sono auto-bid che possono competere
  // NOTA: Non escludere l'auto-bid dell'offerente - può competere con altri auto-bid
  // FIX: Usare >= invece di > per includere parità - l'auto-bid vince in caso di parità
  const competingAutoBids = autoBids
    .map((ab) => ({ ...ab, isActive: true }))
    .filter((ab) => ab.maxAmount >= currentBid);

  if (competingAutoBids.length === 0) {
    // Nessun auto-bid può competere, l'offerta manuale vince
    logger.debug("no competing auto-bid", { currentBid, currentBidderId });
    return {
      finalAmount: currentBid,
      finalBidderId: currentBidderId,
      battleSteps,
      totalSteps: step,
      initialBidderHadWinningManualBid: true,
    };
  }

  // Trova l'auto-bid vincente (massimo importo, poi priorità temporale)
  const winningAutoBid = [...competingAutoBids].sort((a, b) => {
    // Prima ordina per max_amount (decrescente)
    if (b.maxAmount !== a.maxAmount) {
      return b.maxAmount - a.maxAmount;
    }
    // In caso di parità, ordina per createdAt (crescente = primo vince)
    return a.createdAt - b.createdAt;
  })[0];

  logger.debug("winning auto-bid", { userId: winningAutoBid.userId, maxAmount: winningAutoBid.maxAmount });

  // CORREZIONE: Calcola il prezzo finale secondo la logica eBay
  let finalAmount: number;

  // Trova il secondo miglior auto-bid (se esiste)
  const secondBestAutoBid = [...competingAutoBids]
    .filter((ab) => ab.userId !== winningAutoBid.userId)
    .sort((a, b) => {
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      return a.createdAt - b.createdAt;
    })[0];

  if (secondBestAutoBid) {
    logger.debug("second-best auto-bid", { userId: secondBestAutoBid.userId, maxAmount: secondBestAutoBid.maxAmount });

    if (secondBestAutoBid.maxAmount === winningAutoBid.maxAmount) {
      // CASO PARITÀ: il vincitore (primo per timestamp) paga il suo importo massimo
      finalAmount = winningAutoBid.maxAmount;
      logger.debug("auto-bid tie, winner pays max", { finalAmount });
    } else {
      // Il vincitore paga 1 credito più del secondo migliore, ma non più del suo massimo
      finalAmount = Math.min(
        secondBestAutoBid.maxAmount + 1,
        winningAutoBid.maxAmount
      );
      logger.debug("auto-bid pays 1+ second best", { finalAmount });
    }
  } else {
    // Solo un auto-bid: paga 1 credito più dell'offerta manuale, ma non più del suo massimo
    finalAmount = Math.min(currentBid + 1, winningAutoBid.maxAmount);
    logger.debug("single auto-bid pays 1+ manual", { finalAmount });
  }

  // Aggiungi il bid finale dell'auto-bid vincente
  battleSteps.push({
    bidAmount: finalAmount,
    bidderId: winningAutoBid.userId,
    isAutoBid: true,
    step: step++,
  });

  return {
    finalAmount: finalAmount,
    finalBidderId: winningAutoBid.userId,
    battleSteps,
    totalSteps: step,
    initialBidderHadWinningManualBid: false,
  };
}
