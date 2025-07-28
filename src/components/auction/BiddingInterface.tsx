"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoBidModal } from "./AutoBidModal";

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
  onPlaceBid: (amount: number, bidType?: "manual" | "quick") => Promise<void>;
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

  useEffect(() => {
    const newMinValidBid = Math.max(currentBid + 1, minBid);
    if (newMinValidBid > bidAmount) {
      setBidAmount(newMinValidBid);
    }
  }, [currentBid, minBid]);

  const availableBudget = userBudget - lockedCredits;
  const canBid = auctionStatus === "active" && (!isUserHighestBidder || isCounterBid);

  const handleBidSubmit = async (bidType: "manual" | "quick" = "manual") => {
    if (bidAmount <= currentBid) {
      toast.error("L&apos;offerta deve essere superiore all&apos;offerta attuale");
      return;
    }

    if (bidAmount > availableBudget) {
      toast.error("Budget insufficiente per questa offerta");
      return;
    }

    setIsSubmitting(true);
    try {
      await onPlaceBid(bidAmount, bidType);
      toast.success("Offerta piazzata con successo!");
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
      toast.success(`Offerta rapida di ${quickBidAmount} crediti piazzata!`);
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
          <div className="text-center py-8">
            {isUserHighestBidder ? (
              <p className="text-green-600 font-semibold">
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
        <div className="bg-muted p-3 rounded-lg">
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
            >
              +1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickBid(5)}
              disabled={isSubmitting || currentBid + 5 > availableBudget}
            >
              +5
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickBid(10)}
              disabled={isSubmitting || currentBid + 10 > availableBudget}
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

        {/* Submit Button */}
        <Button
          onClick={() => handleBidSubmit("manual")}
          disabled={
            isSubmitting ||
            isLoading ||
            bidAmount <= currentBid ||
            bidAmount > availableBudget
          }
          className="w-full"
          size="lg"
        >
          {isSubmitting ? "Piazzando offerta..." : `Offri ${bidAmount} crediti`}
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
