"use client";

import { useState } from "react";

import { AlertTriangle, DollarSign, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscardPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: {
    id: number;
    name: string;
    role: string;
    team: string;
  };
  leagueId: number;
  onPlayerDiscarded: () => void;
}

export function DiscardPlayerModal({
  isOpen,
  onClose,
  player,
  leagueId,
  onPlayerDiscarded,
}: DiscardPlayerModalProps) {
  const [isDiscarding, setIsDiscarding] = useState(false);

  const handleDiscard = async () => {
    setIsDiscarding(true);

    try {
      const response = await fetch(`/api/leagues/${leagueId}/discard-player`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Errore nello scarto del giocatore");
      }

      const result = await response.json();

      toast.success("Giocatore scartato!", {
        description: `${player.name} è stato rimosso dalla tua rosa. Rimborsati ${result.refundAmount} crediti.`,
        duration: 5000,
      });

      onPlayerDiscarded();
      onClose();
    } catch (error) {
      console.error("Error discarding player:", error);
      toast.error("Errore", {
        description:
          error instanceof Error
            ? error.message
            : "Impossibile scartare il giocatore",
      });
    } finally {
      setIsDiscarding(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Scarta Giocatore
          </DialogTitle>
          <DialogDescription>
            Sei sicuro di voler scartare questo giocatore dalla tua rosa?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Player Info */}
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
            <User className="h-8 w-8 text-muted-foreground" />
            <div className="flex-1">
              <p className="font-medium">{player.name}</p>
              <p className="text-sm text-muted-foreground">
                {player.role} • {player.team}
              </p>
            </div>
          </div>

          {/* Refund Info */}
          <div className="flex items-center gap-3 rounded-lg border bg-green-50 p-3 dark:bg-green-950/30">
            <DollarSign className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-300">
                Rimborso calcolato alla conferma
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                Basato sulla quotazione attuale del giocatore
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/30">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Attenzione:</strong> Questa azione è irreversibile. Il
              giocatore tornerà immediatamente disponibile per altri manager.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDiscarding}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={handleDiscard}
            disabled={isDiscarding}
          >
            {isDiscarding ? "Scartando..." : "Scarta Giocatore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
