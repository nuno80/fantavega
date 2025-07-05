"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Gavel } from "lucide-react";
import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";

interface QuickBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerWithAuctionStatus;
  leagueId: number;
  userId: string;
  onBidSuccess?: () => void; // Callback per refresh dei dati
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
  userId,
  onBidSuccess,
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
    if (player?.currentBid) {
      setBidAmount(player.currentBid + 1);
      setMaxAmount(player.currentBid + 10); // Default max amount
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
      case "P": return "bg-yellow-500 text-yellow-900";
      case "D": return "bg-blue-500 text-blue-900";
      case "C": return "bg-green-500 text-green-900";
      case "A": return "bg-red-500 text-red-900";
      default: return "bg-gray-500 text-gray-900";
    }
  };

  const availableBudget = userBudget ? userBudget.current_budget - userBudget.locked_credits : 0;
  const minValidBid = (player.currentBid || 0) + 1;
  const canSubmitBid = bidAmount >= minValidBid && bidAmount <= availableBudget && !isSubmitting;

  const handleQuickBid = (increment: number) => {
    setBidAmount((player.currentBid || 0) + increment);
  };

  const handleSubmitBid = async () => {
    if (!canSubmitBid) return;

    setIsSubmitting(true);
    try {
      // First, place the manual bid
      const bidResponse = await fetch(
        `/api/leagues/${leagueId}/players/${player.id}/bids`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            amount: bidAmount,
            bid_type: "manual"
          }),
        }
      );

      if (!bidResponse.ok) {
        const error = await bidResponse.json();
        throw new Error(error.error || error.message || "Errore nel piazzare l'offerta");
      }

      // If auto-bid is enabled and max amount is higher than bid amount, set auto-bid
      if (useAutoBid && maxAmount > bidAmount) {
        try {
          const autoBidResponse = await fetch(
            `/api/leagues/${leagueId}/players/${player.id}/auto-bid`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ max_amount: maxAmount }),
            }
          );

          if (!autoBidResponse.ok) {
            const autoBidError = await autoBidResponse.json();
            console.warn("Auto-bid failed:", autoBidError.error);
            toast.warning(`Offerta piazzata, ma auto-bid fallita: ${autoBidError.error}`);
          } else {
            toast.success(`Offerta di ${bidAmount} piazzata con auto-bid fino a ${maxAmount} crediti!`);
          }
        } catch (autoBidError) {
          console.warn("Auto-bid request failed:", autoBidError);
          toast.warning("Offerta piazzata, ma auto-bid non impostata");
        }
      } else {
        toast.success("Offerta piazzata con successo!");
      }

      onClose();
      
      // Trigger refresh of players data
      if (onBidSuccess) {
        onBidSuccess();
      }

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
            Fai un'offerta
          </DialogTitle>
          <DialogDescription>
            Piazza la tua offerta per questo giocatore
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player Info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <div className="h-12 w-12 rounded-full bg-background flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
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
              <p className="font-bold text-lg">{player.currentBid || 0} crediti</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tempo Rimanente:</span>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimeRemaining(player.timeRemaining)}
              </p>
            </div>
          </div>

          {/* Budget Info */}
          {isLoadingBudget ? (
            <div className="h-16 bg-muted animate-pulse rounded-lg" />
          ) : userBudget ? (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Budget Disponibile:</span>
                  <p className="font-bold text-primary">{availableBudget} crediti</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Crediti Bloccati:</span>
                  <p className="font-medium">{userBudget.locked_credits} crediti</p>
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
                disabled={(player.currentBid || 0) + 5 > availableBudget}
              >
                +5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(10)}
                disabled={(player.currentBid || 0) + 10 > availableBudget}
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
          <div className="space-y-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
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
                  Il sistema rilancera automaticamente fino a {maxAmount} crediti quando altri utenti fanno offerte superiori alla tua.
                </p>
              </div>
            )}
          </div>

          {/* Validation Messages */}
          {bidAmount < minValidBid && bidAmount > 0 && (
            <p className="text-sm text-destructive">
              L'offerta deve essere almeno {minValidBid} crediti
            </p>
          )}
          {bidAmount > availableBudget && (
            <p className="text-sm text-destructive">
              Budget insufficiente (disponibili: {availableBudget} crediti)
            </p>
          )}
          {useAutoBid && maxAmount <= bidAmount && (
            <p className="text-sm text-destructive">
              Il prezzo massimo deve essere superiore all'offerta attuale
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
            {isSubmitting ? "Piazzando..." : 
             useAutoBid ? `Offri ${bidAmount} (max ${maxAmount})` : `Offri ${bidAmount} crediti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}