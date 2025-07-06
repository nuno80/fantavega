"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface AutoBidModalProps {
  currentBid: number;
  userBudget: number;
  lockedCredits: number;
  playerId: number;
  leagueId: number;
  playerName: string;
  onAutoBidSet: (maxAmount: number) => Promise<void>;
  existingAutoBid?: {
    max_amount: number;
    is_active: boolean;
  };
}

export function AutoBidModal({
  currentBid,
  userBudget,
  lockedCredits,
  playerId,
  leagueId,
  playerName,
  onAutoBidSet,
  existingAutoBid,
}: AutoBidModalProps) {
  const [maxAmount, setMaxAmount] = useState(existingAutoBid?.max_amount || currentBid + 10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const availableBudget = userBudget - lockedCredits;
  const minAutoBid = currentBid + 1;

  const handleSubmit = async () => {
    if (maxAmount <= currentBid) {
      toast.error("Il prezzo massimo deve essere superiore all'offerta attuale");
      return;
    }

    if (maxAmount > availableBudget) {
      toast.error("Budget insufficiente per questo prezzo massimo");
      return;
    }

    setIsSubmitting(true);
    try {
      await onAutoBidSet(maxAmount);
      toast.success(`Auto-offerta impostata fino a ${maxAmount} crediti`);
      setIsOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore nell'impostare l'auto-offerta"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={existingAutoBid?.is_active ? "default" : "outline"}
          className="w-full"
        >
          {existingAutoBid?.is_active ? (
            <>
              Auto-offerta attiva
              <Badge variant="secondary" className="ml-2">
                Max: {existingAutoBid.max_amount}
              </Badge>
            </>
          ) : (
            "Imposta Auto-offerta"
          )}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Auto-offerta per {playerName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Info Card */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Offerta attuale:</span>
                  <span className="font-semibold">{currentBid} crediti</span>
                </div>
                <div className="flex justify-between">
                  <span>Budget disponibile:</span>
                  <span className="font-semibold">{availableBudget} crediti</span>
                </div>
                {existingAutoBid?.is_active && (
                  <div className="flex justify-between text-blue-600">
                    <span>Auto-offerta attuale:</span>
                    <span className="font-semibold">Max {existingAutoBid.max_amount}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Auto-bid explanation */}
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg text-sm">
            <p className="font-medium mb-1">Come funziona l'auto-offerta:</p>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• Il sistema rilancerà automaticamente fino al tuo prezzo massimo</li>
              <li>• Rilanci di +1 credito quando qualcuno ti supera</li>
              <li>• Si ferma se raggiungi il prezzo massimo</li>
              <li>• Puoi modificare o disattivare in qualsiasi momento</li>
            </ul>
          </div>

          {/* Max Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="maxAmount">Prezzo massimo (crediti)</Label>
            <Input
              id="maxAmount"
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(Number(e.target.value))}
              min={minAutoBid}
              max={availableBudget}
              placeholder={`Min: ${minAutoBid}`}
            />
          </div>

          {/* Quick preset buttons */}
          <div className="space-y-2">
            <Label className="text-sm">Preset rapidi</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMaxAmount(currentBid + 10)}
                disabled={currentBid + 10 > availableBudget}
              >
                +10
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMaxAmount(currentBid + 25)}
                disabled={currentBid + 25 > availableBudget}
              >
                +25
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMaxAmount(currentBid + 50)}
                disabled={currentBid + 50 > availableBudget}
              >
                +50
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                maxAmount <= currentBid ||
                maxAmount > availableBudget
              }
              className="flex-1"
            >
              {isSubmitting ? "Impostando..." : 
               existingAutoBid?.is_active ? "Aggiorna Auto-offerta" : "Imposta Auto-offerta"}
            </Button>
            
            {existingAutoBid?.is_active && (
              <Button
                variant="outline"
                onClick={() => onAutoBidSet(0)} // 0 = disable
                disabled={isSubmitting}
              >
                Disattiva
              </Button>
            )}
          </div>

          {/* Validation Messages */}
          {maxAmount <= currentBid && (
            <p className="text-sm text-destructive">
              Il prezzo massimo deve essere superiore a {currentBid} crediti
            </p>
          )}
          {maxAmount > availableBudget && (
            <p className="text-sm text-destructive">
              Budget insufficiente (disponibili: {availableBudget} crediti)
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
