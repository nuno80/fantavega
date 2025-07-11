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

interface StandardBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  playerRole: string;
  playerTeam: string;
  playerId: number;
  leagueId: number;
  currentBid?: number;
  isNewAuction?: boolean; // true per "Avvia asta", false per rilanci
  onBidSuccess?: () => void;
  title?: string; // Custom title (es. "Rilancia", "Avvia asta", "Fai offerta")
}

interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  team_name?: string;
}

const getRoleBadgeColor = (role: string) => {
  const roleColors: { [key: string]: string } = {
    'P': 'bg-yellow-500 text-yellow-50',
    'D': 'bg-blue-500 text-blue-50', 
    'C': 'bg-green-500 text-green-50',
    'A': 'bg-red-500 text-red-50'
  };
  return roleColors[role] || 'bg-gray-500 text-gray-50';
};

export function StandardBidModal({
  isOpen,
  onClose,
  playerName,
  playerRole,
  playerTeam,
  playerId,
  leagueId,
  currentBid = 0,
  isNewAuction = false,
  onBidSuccess,
  title = "Fai un'offerta"
}: StandardBidModalProps) {
  const [bidAmount, setBidAmount] = useState(currentBid + 1);
  const [maxAmount, setMaxAmount] = useState(currentBid + 10);
  const [useAutoBid, setUseAutoBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);

  // Fetch user budget
  useEffect(() => {
    if (!isOpen) return;

    const fetchUserBudget = async () => {
      try {
        setIsLoadingBudget(true);
        const response = await fetch(`/api/leagues/${leagueId}/budget`);
        if (response.ok) {
          const budgetData = await response.json();
          setUserBudget(budgetData);
        }
      } catch (error) {
        console.error("Error fetching user budget:", error);
        toast.error("Errore nel caricamento del budget");
      } finally {
        setIsLoadingBudget(false);
      }
    };

    fetchUserBudget();
  }, [isOpen, leagueId]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialBid = isNewAuction ? 1 : currentBid + 1;
      setBidAmount(initialBid);
      setMaxAmount(initialBid + 10);
      setUseAutoBid(false);
      setIsSubmitting(false);
    }
  }, [isOpen, currentBid, isNewAuction]);

  const availableBudget = userBudget ? userBudget.current_budget - userBudget.locked_credits : 0;
  const minValidBid = isNewAuction ? 1 : currentBid + 1;
  const canSubmitBid = bidAmount >= minValidBid && bidAmount <= availableBudget && !isSubmitting;

  const handleQuickBid = (increment: number) => {
    setBidAmount(currentBid + increment);
  };

  const handleSubmitBid = async () => {
    if (!canSubmitBid) return;

    setIsSubmitting(true);
    try {
      let endpoint: string;
      let body: any;

      if (isNewAuction) {
        // Avvia nuova asta
        endpoint = `/api/leagues/${leagueId}/start-auction`;
        body = { 
          playerId: playerId,
          initialBid: bidAmount
        };
      } else {
        // Rilancio su asta esistente
        endpoint = `/api/leagues/${leagueId}/players/${playerId}/bids`;
        body = { 
          amount: bidAmount,
          bidType: "manual"
        };
      }

      const bidResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!bidResponse.ok) {
        const error = await bidResponse.json();
        throw new Error(error.error || error.message || "Errore nel piazzare l'offerta");
      }

      // Se auto-bid è abilitato e il prezzo massimo è superiore all'offerta
      if (useAutoBid && maxAmount > bidAmount) {
        try {
          const autoBidResponse = await fetch(
            `/api/leagues/${leagueId}/players/${playerId}/auto-bid`,
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
        const successMessage = isNewAuction 
          ? "Asta avviata con successo!" 
          : "Offerta piazzata con successo!";
        toast.success(successMessage);
      }

      onClose();
      
      // Trigger refresh
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

  if (isLoadingBudget) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Caricamento</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Caricamento budget...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isNewAuction ? "Avvia l'asta per questo giocatore" : "Rilancia la tua offerta"}
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
                <Badge className={getRoleBadgeColor(playerRole)}>
                  {playerRole}
                </Badge>
                <h3 className="font-semibold">{playerName}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{playerTeam}</p>
              {!isNewAuction && (
                <p className="text-sm">
                  Offerta attuale: <span className="font-semibold">{currentBid} crediti</span>
                </p>
              )}
            </div>
          </div>

          {/* Budget Info */}
          {userBudget && (
            <div className="flex justify-between text-sm p-2 bg-blue-50 dark:bg-blue-950/20 rounded">
              <span>Budget disponibile:</span>
              <span className="font-semibold">{availableBudget} crediti</span>
            </div>
          )}

          {/* Quick Bid Buttons */}
          <div className="space-y-2">
            <Label>Offerte Rapide</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(1)}
                disabled={currentBid + 1 > availableBudget}
              >
                +1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(5)}
                disabled={currentBid + 5 > availableBudget}
              >
                +5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(10)}
                disabled={currentBid + 10 > availableBudget}
              >
                +10
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(20)}
                disabled={currentBid + 20 > availableBudget}
              >
                +20
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
                  Il sistema rilancerà automaticamente fino a {maxAmount} crediti quando altri utenti fanno offerte superiori alla tua.
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
             useAutoBid ? `Offri ${bidAmount} (max ${maxAmount})` : 
             isNewAuction ? `Avvia asta a ${bidAmount} crediti` : `Offri ${bidAmount} crediti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}