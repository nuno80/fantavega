"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Dynamic import per lazy loading del modale
const AutoBidModal = dynamic(
  () =>
    import("./AutoBidModal").then((mod) => mod.AutoBidModal),
  {
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
    ssr: false,
  }
);

interface BiddingInterfaceProps {
  currentBid: number;
  minBid: number;
  userBudget: number;
  lockedCredits: number;
  isUserHighestBidder: boolean;
  auctionStatus: string;
  playerId: number;
  leagueId: number;
  playerName: string;
  onPlaceBid: (
    amount: number,
    bidType?: "manual" | "quick",
    maxAmount?: number
  ) => Promise<void>;
  existingAutoBid?: {
    max_amount: number;
    is_active: boolean;
  };
  isLoading?: boolean;
  defaultBidAmount?: number;
  isCounterBid?: boolean;
}

export function BiddingInterface({
  currentBid,
  minBid,
  userBudget,
  lockedCredits,
  isUserHighestBidder,
  auctionStatus,
  playerId,
  leagueId,
  playerName,
  onPlaceBid,
  existingAutoBid,
  isLoading = false,
  defaultBidAmount,
  isCounterBid = false,
}: BiddingInterfaceProps) {
  const minValidBid = Math.max(currentBid + 1, minBid);
  const [bidAmount, setBidAmount] = useState(defaultBidAmount || minValidBid);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useAutoBid, setUseAutoBid] = useState(false);
  const [maxAmount, setMaxAmount] = useState(minValidBid + 10);

  useEffect(() => {
    const newMinValidBid = Math.max(currentBid + 1, minBid);
    if (newMinValidBid > bidAmount) {
      setBidAmount(newMinValidBid);
    }
  }, [currentBid, minBid, bidAmount]);

  const availableBudget = userBudget - lockedCredits;
  const canBid =
    auctionStatus === "active" && (!isUserHighestBidder || isCounterBid);

  const handleBidSubmit = async (bidType: "manual" | "quick" = "manual") => {
    if (bidAmount <= currentBid) {
      toast.error(
        "L&apos;offerta deve essere superiore all&apos;offerta attuale"
      );
      return;
    }

    if (bidAmount > availableBudget) {
      toast.error("Budget insufficiente per questa offerta");
      return;
    }

    if (useAutoBid && maxAmount <= bidAmount) {
      toast.error(
        "Il prezzo massimo deve essere superiore all'offerta attuale"
      );
      return;
    }

    console.log("[DEBUG BIDDING] About to call onPlaceBid with:");
    console.log("[DEBUG BIDDING] bidAmount:", bidAmount);
    console.log("[DEBUG BIDDING] bidType:", bidType);
    console.log("[DEBUG BIDDING] useAutoBid:", useAutoBid);
    console.log(
      "[DEBUG BIDDING] maxAmount:",
      useAutoBid ? maxAmount : undefined
    );

    setIsSubmitting(true);
    try {
      await onPlaceBid(bidAmount, bidType, useAutoBid ? maxAmount : undefined);
      // Toast rimosso - la UI si aggiorna via socket
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore nel piazzare l'offerta"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickBid = async (increment: number) => {
    const quickBidAmount = currentBid + increment;

    if (quickBidAmount > availableBudget) {
      toast.error("Budget insufficiente per questa offerta rapida");
      return;
    }

    setIsSubmitting(true);
    try {
      await onPlaceBid(quickBidAmount, "quick");
      // Toast rimosso - la UI si aggiorna via socket
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore nell'offerta rapida"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canBid) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Offerte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            {isUserHighestBidder ? (
              <p className="font-semibold text-green-600">
                Sei il miglior offerente!
              </p>
            ) : auctionStatus !== "active" ? (
              <p className="text-muted-foreground">Asta non più attiva</p>
            ) : (
              <p className="text-muted-foreground">Non puoi fare offerte</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fai la tua offerta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Budget Info */}
        <div className="rounded-lg bg-muted p-3">
          <div className="flex justify-between text-sm">
            <span>Budget disponibile:</span>
            <span className="font-semibold">{availableBudget} crediti</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Crediti bloccati:</span>
            <span>{lockedCredits} crediti</span>
          </div>
        </div>

        {/* Quick Bid Buttons */}
        <div className="space-y-2">
          <Label className="text-sm">Offerte rapide</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickBid(1)}
              disabled={isSubmitting || currentBid + 1 > availableBudget}
              className="transition-all hover:scale-105 hover:bg-primary/10 hover:text-primary active:scale-95"
            >
              +1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickBid(5)}
              disabled={isSubmitting || currentBid + 5 > availableBudget}
              className="transition-all hover:scale-105 hover:bg-primary/10 hover:text-primary active:scale-95"
            >
              +5
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickBid(10)}
              disabled={isSubmitting || currentBid + 10 > availableBudget}
              className="transition-all hover:scale-105 hover:bg-primary/10 hover:text-primary active:scale-95"
            >
              +10
            </Button>
          </div>
        </div>

        {/* Custom Bid Input */}
        <div className="space-y-2">
          <Label htmlFor="bidAmount">Offerta personalizzata</Label>
          <Input
            id="bidAmount"
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(Number(e.target.value))}
            min={minValidBid}
            max={availableBudget}
            placeholder={`Min: ${minValidBid}`}
          />
        </div>

        {/* Auto-bid Section */}
        <div className="space-y-3 rounded-lg border bg-blue-50 p-3 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="useAutoBid"
                checked={useAutoBid}
                onChange={(e) => setUseAutoBid(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="useAutoBid" className="text-sm font-medium">
                Abilita Offerta Automatica
              </Label>
            </div>

            {existingAutoBid?.is_active && (
              <div className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900/30">
                Auto-bid attivo: {existingAutoBid.max_amount} crediti
              </div>
            )}
          </div>

          {useAutoBid && (
            <div className="space-y-2">
              <Label htmlFor="maxAmount" className="text-sm">
                Prezzo massimo per rilanci automatici
              </Label>
              <Input
                id="maxAmount"
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(Number(e.target.value))}
                min={bidAmount + 1}
                max={availableBudget}
                placeholder={`Min: ${bidAmount + 1}`}
              />
              <p className="text-xs text-blue-600">
                Il sistema rilancerà automaticamente fino a {maxAmount} crediti
                quando altri utenti fanno offerte superiori alla tua.
              </p>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <Button
          onClick={() => handleBidSubmit("manual")}
          disabled={
            isSubmitting ||
            isLoading ||
            bidAmount <= currentBid ||
            bidAmount > availableBudget ||
            (useAutoBid && maxAmount <= bidAmount)
          }
          className="w-full text-lg font-bold shadow-md transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
          size="lg"
        >
          {isSubmitting
            ? "Piazzando offerta..."
            : useAutoBid
              ? `Offri ${bidAmount} (max ${maxAmount})`
              : `Offri ${bidAmount} crediti`}
        </Button>

        {/* Auto-Bid Modal */}
        <AutoBidModal
          currentBid={currentBid}
          userBudget={userBudget}
          lockedCredits={lockedCredits}
          playerId={playerId}
          leagueId={leagueId}
          playerName={playerName}
          existingAutoBid={existingAutoBid}
          defaultMaxAmount={isCounterBid ? currentBid + 1 : undefined}
        />

        {/* Validation Messages */}
        {bidAmount <= currentBid && (
          <p className="text-sm text-destructive">
            L&apos;offerta deve essere superiore a {currentBid} crediti
          </p>
        )}
        {bidAmount > availableBudget && (
          <p className="text-sm text-destructive">
            Budget insufficiente (disponibili: {availableBudget} crediti)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
