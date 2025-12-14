"use client";

import { useEffect, useState } from "react";

import { Gavel, User } from "lucide-react";
import { toast } from "sonner";

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
  onBidSuccess?: (
    amount: number,
    bidType?: "manual" | "quick",
    maxAmount?: number
  ) => Promise<void>;
  title?: string; // Custom title (es. "Rilancia", "Avvia asta", "Fai offerta")
  existingAutoBid?: {
    max_amount: number;
    is_active: boolean;
  } | null; // Auto-bid esistente dell'utente (solo per rilanci)
  playerQtA?: number; // QtA del giocatore per nuove aste
}

interface UserBudgetInfo {
  current_budget: number;
  locked_credits: number;
  team_name?: string;
}

const getRoleBadgeColor = (role: string) => {
  const roleColors: { [key: string]: string } = {
    P: "bg-yellow-500 text-yellow-50",
    D: "bg-blue-500 text-blue-50",
    C: "bg-green-500 text-green-50",
    A: "bg-red-500 text-red-50",
  };
  return roleColors[role] || "bg-gray-500 text-gray-50";
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
  title = "Fai un'offerta",
  existingAutoBid = null,
  playerQtA = 1,
}: StandardBidModalProps) {
  const [bidAmount, setBidAmount] = useState(currentBid + 1);
  const [maxAmount, setMaxAmount] = useState(currentBid + 10);
  const [useAutoBid, setUseAutoBid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userBudget, setUserBudget] = useState<UserBudgetInfo | null>(null);
  const [isLoadingBudget, setIsLoadingBudget] = useState(true);
  const [fetchedAutoBid, setFetchedAutoBid] = useState<{
    max_amount: number;
    is_active: boolean;
  } | null>(null);

  // Fetch user budget and auto-bid data
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setIsLoadingBudget(true);

        // Fetch budget
        const budgetResponse = await fetch(`/api/leagues/${leagueId}/budget`);
        if (budgetResponse.ok) {
          const budgetData = await budgetResponse.json();
          setUserBudget(budgetData);
        }

        // Fetch auto-bid only if not provided and not a new auction
        if (!isNewAuction && !existingAutoBid) {
          const autoBidResponse = await fetch(
            `/api/leagues/${leagueId}/players/${playerId}/auto-bid`
          );
          if (autoBidResponse.ok) {
            const autoBidData = await autoBidResponse.json();
            setFetchedAutoBid(autoBidData.auto_bid);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Errore nel caricamento dei dati");
      } finally {
        setIsLoadingBudget(false);
      }
    };

    fetchData();
  }, [isOpen, leagueId, playerId, isNewAuction, existingAutoBid]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      // IMPORTANT: Ensure minimum bid is at least 3 credits for new auctions
      const initialBid = isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1;
      setBidAmount(initialBid);

      // Use existing auto-bid data if available
      const currentAutoBid = existingAutoBid || fetchedAutoBid;
      if (currentAutoBid && currentAutoBid.is_active) {
        setMaxAmount(currentAutoBid.max_amount);
        setUseAutoBid(true);
      } else {
        setMaxAmount(initialBid + 10);
        setUseAutoBid(false);
      }

      setIsSubmitting(false);
    }
  }, [
    isOpen,
    currentBid,
    isNewAuction,
    existingAutoBid,
    fetchedAutoBid,
    playerQtA,
  ]);

  const availableBudget = userBudget
    ? userBudget.current_budget - userBudget.locked_credits
    : 0;
  // IMPORTANT: Ensure minimum bid is at least 3 credits for new auctions
  // This addresses the backend requirement: "Devi offrire almeno 3 crediti per avviare l'asta"
  const baseMinBid = isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1;
  const minValidBid = baseMinBid;
  const canSubmitBid =
    bidAmount >= minValidBid && bidAmount <= availableBudget && !isSubmitting;

  const handleQuickBid = (increment: number) => {
    // IMPORTANT: Ensure minimum bid is at least 3 credits for new auctions
    const baseAmount = isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1;
    setBidAmount(baseAmount + increment);
  };

  const handleSubmitBid = async () => {
    if (!canSubmitBid) return;

    setIsSubmitting(true);
    try {
      // Il modale passa i dati al genitore, che gestisce la logica API.
      if (onBidSuccess) {
        await onBidSuccess(
          bidAmount,
          useAutoBid ? "quick" : "manual",
          useAutoBid ? maxAmount : undefined
        );
        // Il genitore gestirà la notifica di successo e la chiusura del modale.
        onClose();
      } else {
        console.error(
          "StandardBidModal requires an onBidSuccess handler to function."
        );
        toast.error("Errore di configurazione", {
          description:
            "L'azione di offerta non è stata collegata correttamente.",
        });
      }
    } catch (error) {
      // Parse the error message to provide specific user feedback
      let userFriendlyMessage = "Si è verificato un errore sconosciuto";

      if (error instanceof Error) {
        const errorMessage = error.message;

        // Check for specific error conditions and provide appropriate messages
        if (errorMessage.includes("superiore all'offerta attuale")) {
          // Extract the current bid amount from the error message
          const bidMatch = errorMessage.match(/(\d+)\s*crediti/);
          const currentBid = bidMatch ? parseInt(bidMatch[1]) : null;

          if (currentBid !== null) {
            userFriendlyMessage = isNewAuction
              ? `Devi offrire almeno ${Math.max(currentBid + 1, playerQtA)} crediti per avviare l'asta`
              : `Devi offrire almeno ${currentBid + 1} crediti per superare l'offerta attuale`;
          } else {
            userFriendlyMessage = isNewAuction
              ? "Devi aumentare l'importo per avviare l'asta"
              : "Devi aumentare la tua offerta per superare quella attuale";
          }
        } else if (
          errorMessage.includes("già il miglior offerente") ||
          errorMessage.includes("stesso utente")
        ) {
          userFriendlyMessage =
            "Sei già il miglior offerente per questo giocatore";
        } else if (
          errorMessage.includes("budget") ||
          errorMessage.includes("crediti insufficienti")
        ) {
          userFriendlyMessage = "Budget insufficiente per questa offerta";
        } else if (
          errorMessage.includes("asta già") ||
          errorMessage.includes("auction already")
        ) {
          userFriendlyMessage = "Un'asta per questo giocatore è già in corso";
        } else {
          // Use the original error message if it's already user-friendly
          userFriendlyMessage = errorMessage;
        }
      }

      toast.error(
        isNewAuction ? "Impossibile avviare l'asta" : "Offerta Fallita",
        {
          description: userFriendlyMessage,
        }
      );
      console.error("Error in handleSubmitBid:", error);
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
              <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">
                Caricamento budget...
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isNewAuction
              ? "Avvia l'asta per questo giocatore"
              : "Rilancia la tua offerta"}
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
                <Badge className={getRoleBadgeColor(playerRole)}>
                  {playerRole}
                </Badge>
                <h3 className="font-semibold">{playerName}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{playerTeam}</p>
              {!isNewAuction && (
                <p className="text-sm">
                  Offerta attuale:{" "}
                  <span className="font-semibold">{currentBid} crediti</span>
                </p>
              )}
            </div>
          </div>

          {/* Budget Info */}
          {userBudget && (
            <div className="flex justify-between rounded bg-blue-50 p-2 text-sm dark:bg-blue-950/20">
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
                onClick={() => handleQuickBid(0)}
                disabled={
                  isSubmitting ||
                  (isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1) >
                  availableBudget
                }
              >
                MIN
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(1)}
                disabled={
                  isSubmitting ||
                  (isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1) + 1 >
                  availableBudget
                }
              >
                +1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(4)}
                disabled={
                  isSubmitting ||
                  (isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1) + 4 >
                  availableBudget
                }
              >
                +5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(9)}
                disabled={
                  isSubmitting ||
                  (isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1) + 9 >
                  availableBudget
                }
              >
                +10
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickBid(19)}
                disabled={
                  isSubmitting ||
                  (isNewAuction ? Math.max(playerQtA, 3) : currentBid + 1) +
                  19 >
                  availableBudget
                }
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

              {/* Show existing auto-bid info */}
              {!isNewAuction &&
                (existingAutoBid || fetchedAutoBid) &&
                (existingAutoBid?.is_active || fetchedAutoBid?.is_active) && (
                  <div className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-600 dark:bg-blue-900/30">
                    Auto-bid attivo:{" "}
                    {(existingAutoBid || fetchedAutoBid)?.max_amount} crediti
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
                  Il sistema rilancerà automaticamente fino a {maxAmount}{" "}
                  crediti quando altri utenti fanno offerte superiori alla tua.
                </p>
              </div>
            )}
          </div>

          {/* Validation Messages */}
          {bidAmount < minValidBid && bidAmount > 0 && (
            <p className="text-sm text-destructive">
              {isNewAuction
                ? `L'offerta deve essere almeno ${minValidBid} crediti per avviare l'asta`
                : `L'offerta deve essere almeno ${minValidBid} crediti`}
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
                : isNewAuction
                  ? `Avvia asta a ${bidAmount} crediti`
                  : `Offri ${bidAmount} crediti`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
