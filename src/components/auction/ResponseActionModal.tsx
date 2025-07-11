"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, DollarSign, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
      const response = await fetch(
        `/api/leagues/${leagueId}/players/${playerId}/response-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abandon" }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        onClose();
      } else {
        toast.error(data.error || "Errore durante l'abbandono");
      }
    } catch (error) {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCounterBid = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/players/${playerId}/response-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "counter_bid" }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        onClose();
        onCounterBid(); // Apre il modal di offerta
      } else {
        toast.error(data.error || "Errore durante la preparazione dell'offerta");
      }
    } catch (error) {
      toast.error("Errore di connessione");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
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
          <div className="bg-muted p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground">Offerta attuale:</span>
              <span className="font-semibold text-lg">{currentBid} crediti</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Tempo rimanente:</span>
              <span className={`font-semibold ${timeRemaining < 300 ? 'text-red-500' : 'text-orange-500'}`}>
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Attenzione:</strong> Hai 1 ora per decidere. Se non agisci, l'asta verrà abbandonata automaticamente 
              e non potrai fare offerte per questo giocatore per 48 ore.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={handleAbandon}
              disabled={isLoading}
              className="flex-1"
            >
              <X className="h-4 w-4 mr-2" />
              Abbandona
            </Button>
            <Button
              onClick={handleCounterBid}
              disabled={isLoading}
              className="flex-1"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Rilancia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}