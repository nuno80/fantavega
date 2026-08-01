// src/lib/db/services/bid-battle.ts
// Logica pura di simulazione della battaglia Auto-Bid.
// Nessun import da @/lib/db, socket-emitter o servizi con side-effect:
// questa funzione è deterministica e testabile in isolamento.
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

// Funzione di simulazione battaglia Auto-Bid
export function simulateAutoBidBattle(
  initialBid: number,
  initialBidderId: string,
  autoBids: AutoBidBattleParticipant[]
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

  // Rendi tutti i partecipanti attivi all'inizio
  autoBids.forEach((ab) => (ab.isActive = true));

  // CORREZIONE: Controlla se ci sono auto-bid che possono competere
  // NOTA: Non escludere l'auto-bid dell'offerente - può competere con altri auto-bid
  // FIX: Usare >= invece di > per includere parità - l'auto-bid vince in caso di parità
  const competingAutoBids = autoBids.filter((ab) => ab.maxAmount >= currentBid);

  if (competingAutoBids.length === 0) {
    // Nessun auto-bid può competere, l'offerta manuale vince
    console.log(
      `[AUTO_BID] Nessun auto-bid può competere con l'offerta manuale di ${currentBid}`
    );
    return {
      finalAmount: currentBid,
      finalBidderId: currentBidderId,
      battleSteps,
      totalSteps: step,
      initialBidderHadWinningManualBid: true,
    };
  }

  // Trova l'auto-bid vincente (massimo importo, poi priorità temporale)
  const winningAutoBid = competingAutoBids.sort((a, b) => {
    // Prima ordina per max_amount (decrescente)
    if (b.maxAmount !== a.maxAmount) {
      return b.maxAmount - a.maxAmount;
    }
    // In caso di parità, ordina per createdAt (crescente = primo vince)
    return a.createdAt - b.createdAt;
  })[0];

  console.log(
    `[AUTO_BID] Auto-bid vincente: ${winningAutoBid.userId} con max ${winningAutoBid.maxAmount}`
  );

  // CORREZIONE: Calcola il prezzo finale secondo la logica eBay
  let finalAmount: number;

  // Trova il secondo miglior auto-bid (se esiste)
  const secondBestAutoBid = competingAutoBids
    .filter((ab) => ab.userId !== winningAutoBid.userId)
    .sort((a, b) => {
      if (b.maxAmount !== a.maxAmount) {
        return b.maxAmount - a.maxAmount;
      }
      return a.createdAt - b.createdAt;
    })[0];

  if (secondBestAutoBid) {
    console.log(
      `[AUTO_BID] Secondo miglior auto-bid: ${secondBestAutoBid.userId} con max ${secondBestAutoBid.maxAmount}`
    );

    if (secondBestAutoBid.maxAmount === winningAutoBid.maxAmount) {
      // CASO PARITÀ: il vincitore (primo per timestamp) paga il suo importo massimo
      finalAmount = winningAutoBid.maxAmount;
      console.log(
        `[AUTO_BID] PARITÀ rilevata! Vincitore paga importo massimo: ${finalAmount}`
      );
    } else {
      // Il vincitore paga 1 credito più del secondo migliore, ma non più del suo massimo
      finalAmount = Math.min(
        secondBestAutoBid.maxAmount + 1,
        winningAutoBid.maxAmount
      );
      console.log(
        `[AUTO_BID] Vincitore paga 1+ del secondo migliore: ${finalAmount}`
      );
    }
  } else {
    // Solo un auto-bid: paga 1 credito più dell'offerta manuale, ma non più del suo massimo
    finalAmount = Math.min(currentBid + 1, winningAutoBid.maxAmount);
    console.log(
      `[AUTO_BID] Solo un auto-bid, paga 1+ dell'offerta manuale: ${finalAmount}`
    );
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
