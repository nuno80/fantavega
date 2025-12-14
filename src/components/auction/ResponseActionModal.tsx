"use client";

import { useState } from "react";

import { AlertTriangle, DollarSign, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { abandonAuctionAction } from "@/lib/actions/auction.actions";

interface ResponseActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerName: string;
  currentBid: number;
  timeRemaining: number;
  leagueId: number;
  playerId: number;
  onCounterBid: () => void;
}

export function ResponseActionModal({
  isOpen,
  onClose,
  playerName,
  currentBid,
  timeRemaining,
  leagueId,
  playerId,
  onCounterBid,
}: ResponseActionModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const formatTimeRemaining = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const handleAbandon = async () => {
    setIsLoading(true);
    try {
      const result = await abandonAuctionAction(leagueId, playerId);

      if (result.success) {
        toast.success(result.message || "Asta abbandonata con successo");
        onClose();
        // UI will update automatically via socket events
      } else {
        toast.error(result.error || "Errore durante l'abbandono");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Errore di connessione";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCounterBid = () => {
    // Simply close this modal and open the bid modal
    // The actual bid will be handled by the StandardBidModal with Server Actions
    onClose();
    onCounterBid();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Sei stato superato!
          </DialogTitle>
          <DialogDescription>
            La tua offerta per <strong>{playerName}</strong> è stata superata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Offerta attuale:
              </span>
              <span className="text-lg font-semibold">
                {currentBid} crediti
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Tempo rimanente:
              </span>
              <span
                className={`font-semibold ${timeRemaining < 300 ? "text-red-500" : "text-orange-500"}`}
              >
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Attenzione:</strong> Hai 1 ora per decidere. Se non
              agisci, l&apos;asta verrà abbandonata automaticamente e non potrai
              fare offerte per questo giocatore per 48 ore.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={handleAbandon}
              disabled={isLoading}
              className="flex-1"
            >
              <X className="mr-2 h-4 w-4" />
              Abbandona
            </Button>
            <Button
              onClick={handleCounterBid}
              className="flex-1"
            >
              <DollarSign className="mr-2 h-4 w-4" />
              Rilancia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
