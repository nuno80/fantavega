"use client";

import { useEffect, useState } from "react";

import { Clock, Gavel, User } from "lucide-react";
import { toast } from "sonner";

import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface QuickBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerWithAuctionStatus;
  leagueId: number;
  userId: string;
  onBidSuccess?: () => void; // Callback for manual refresh. Update is now handled by Socket.IO with fallback to this callback.
}

interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  team_name?: string;
}

export function QuickBidModal({
  isOpen,
  onClose,
  player,
  leagueId,
  userId: _userId,
  onBidSuccess: _onBidSuccess,
}: QuickBidModalProps) {
  const [bidAmount, setBidAmount] = useState(0);
  const [maxAmount, setMaxAmount] = useState(0);
  const [useAutoBid, setUseAutoBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(false);

  // Fetch user budget when modal opens
  useEffect(() => {
    if (isOpen && leagueId) {
      const fetchBudget = async () => {
        try {
          setIsLoadingBudget(true);
          const response = await fetch(`/api/leagues/${leagueId}/budget`);
          if (response.ok) {
            const budget = await response.json();
            setUserBudget(budget);
          }
        } catch (error) {
          console.error("Error fetching budget:", error);
        } finally {
          setIsLoadingBudget(false);
        }
      };
      fetchBudget();
    }
  }, [isOpen, leagueId]);

  // Set initial bid amount when player changes
  useEffect(() => {
    console.log("[QuickBidModal] Player data:", {
      name: player?.name,
      currentBid: player?.currentBid,
      qtA: player?.qtA,
      auctionStatus: player?.auctionStatus,
    });

    if (player?.currentBid) {
      // Asta attiva: offerta attuale + 1
      console.log(
        "[QuickBidModal] Using currentBid + 1:",
        player.currentBid + 1
      );
      setBidAmount(player.currentBid + 1);
      setMaxAmount(player.currentBid + 10);
    } else if (player?.qtA) {
      // Nessuna asta attiva: usa QtA come valore di default
      console.log("[QuickBidModal] Using qtA:", player.qtA);
      setBidAmount(player.qtA);
      setMaxAmount(player.qtA + 10);
    } else {
      // Fallback: 1 credito
      console.log("[QuickBidModal] Using fallback: 1");
      setBidAmount(1);
      setMaxAmount(10);
    }
  }, [player]);

  const formatTimeRemaining = (seconds?: number) => {
    if (!seconds) return "Scaduta";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "P":
        return "bg-yellow-500 text-yellow-900";
      case "D":
        return "bg-green-500 text-green-900";
      case "C":
        return "bg-blue-500 text-blue-900";
      case "A":
        return "bg-red-500 text-red-900";
      default:
        return "bg-gray-500 text-gray-900";
    }
  };

  const availableBudget = userBudget
    ? userBudget.current_budget - userBudget.locked_credits
    : 0;
  // Calcola l'offerta minima valida
  const minValidBid = player.currentBid
    ? player.currentBid + 1 // Asta attiva: offerta attuale + 1
    : player.qtA || 1; // Nessuna asta: QtA o 1 come fallback
  const canSubmitBid =
    bidAmount >= minValidBid && bidAmount <= availableBudget && !isSubmitting;

  const handleQuickBid = (increment: number) => {
    const baseAmount = player.currentBid || player.qtA || 0;
    setBidAmount(baseAmount + increment);
  };

  const handleSubmitBid = async () => {
    if (!canSubmitBid) return;

    setIsSubmitting(true);

    // Construct the request body in a single object
    const requestBody: {
      amount: number;
      bid_type: "manual" | "auto";
      max_amount?: number;
    } = {
      amount: bidAmount,
      bid_type: useAutoBid ? "auto" : "manual",
    };

    if (useAutoBid && maxAmount > bidAmount) {
      requestBody.max_amount = maxAmount;
    }

    console.log("[DEBUG QUICK BID] About to submit bid with:");
    console.log("[DEBUG QUICK BID] bidAmount:", bidAmount);
    console.log("[DEBUG QUICK BID] useAutoBid:", useAutoBid);
    console.log("[DEBUG QUICK BID] maxAmount:", maxAmount);
    console.log("[DEBUG QUICK BID] requestBody:", requestBody);

    try {
      // Execute a single API call for the bid and auto-bid
      const response = await fetch(
        `/api/leagues/${leagueId}/players/${player.id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore nel piazzare l'offerta");
      }

      // Handle success of the unified call
      if (useAutoBid && requestBody.max_amount) {
        toast.success(
          `Offerta di ${bidAmount} piazzata con auto-bid fino a ${maxAmount} crediti!`
        );
      } else {
        toast.success("Offerta piazzata con successo!");
      }

      onClose();

      // Force a refresh of player data to ensure UI updates
      // This is a fallback in case the socket event is throttled or not received promptly
      // We'll wait a short time before calling onBidSuccess to allow socket events to process
      if (typeof _onBidSuccess === 'function') {
        // Wait 500ms to allow socket event to be processed first
        setTimeout(() => {
          console.log("[QuickBidModal] Calling onBidSuccess fallback");
          _onBidSuccess();
        }, 500);
      }

      // The onBidSuccess() callback is used as a fallback mechanism.
      // The primary update mechanism is the Socket.IO listener in PlayerSearchInterface,
      // but this fallback ensures the UI updates even if socket events are delayed.
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore nel piazzare l'offerta"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Fai un&apos;offerta
          </DialogTitle>
          <DialogDescription>
            Piazza la tua offerta per questo giocatore
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player Info */}
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <Badge className={getRoleBadgeColor(player.role)}>
                  {player.role}
                </Badge>
                <h3 className="font-semibold">{player.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{player.team}</p>
            </div>
          </div>

          {/* Auction Status */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Offerta Attuale:</span>
              <p className="text-lg font-bold">
                {player.currentBid || 0} crediti
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Tempo Rimanente:</span>
              <p className="flex items-center gap-1 font-medium">
                <Clock className="h-3 w-3" />
                {formatTimeRemaining(player.timeRemaining)}
              </p>
            </div>
          </div>

          {/* Budget Info */}
          {isLoadingBudget ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          ) : userBudget ? (
            <div className="rounded-lg bg-primary/10 p-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    Budget Disponibile:
                  </span>
                  <p className="font-bold text-primary">
                    {availableBudget} crediti
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Crediti Bloccati:
                  </span>
                  <p className="font-medium">
                    {userBudget.locked_credits} crediti
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Quick Bid Buttons */}
          <div className="space-y-2">
            <Label className="text-sm">Offerte Rapide</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(1)}
                disabled={minValidBid > availableBudget}
              >
                +1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(5)}
                disabled={
                  (player.currentBid || player.qtA || 0) + 5 > availableBudget
                }
              >
                +5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(10)}
                disabled={
                  (player.currentBid || player.qtA || 0) + 10 > availableBudget
                }
              >
                +10
              </Button>
            </div>
          </div>

          {/* Custom Bid Input */}
          <div className="space-y-2">
            <Label htmlFor="bidAmount">Offerta Personalizzata</Label>
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
                  Il sistema rilancera automaticamente fino a {maxAmount}{" "}
                  crediti quando altri utenti fanno offerte superiori alla tua.
                </p>
              </div>
            )}
          </div>

          {/* Validation Messages */}
          {bidAmount < minValidBid && bidAmount > 0 && (
            <p className="text-sm text-destructive">
              L&apos;offerta deve essere almeno {minValidBid} crediti
            </p>
          )}
          {bidAmount > availableBudget && (
            <p className="text-sm text-destructive">
              Budget insufficiente (disponibili: {availableBudget} crediti)
            </p>
          )}
          {useAutoBid && maxAmount <= bidAmount && (
            <p className="text-sm text-destructive">
              Il prezzo massimo deve essere superiore all&apos;offerta attuale
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmitBid}
            disabled={!canSubmitBid || (useAutoBid && maxAmount <= bidAmount)}
          >
            {isSubmitting
              ? "Piazzando..."
              : useAutoBid
                ? `Offri ${bidAmount} (max ${maxAmount})`
                : `Offri ${bidAmount} crediti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
