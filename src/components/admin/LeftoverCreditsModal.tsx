"use client";

/**
 * Modal per aggiungere/modificare crediti residui dai partecipanti.
 * Permette all'admin di aggiustare il budget dopo l'import delle rose.
 */

import { Coins, Minus, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

import { addLeftoverCreditsAction } from "@/lib/actions/league.actions";

interface Participant {
  userId: string;
  username: string | null;
  teamName: string | null;
  currentBudget: number;
}

interface LeftoverCreditsModalProps {
  leagueId: number;
  leagueName: string;
  participants: Participant[];
}

export function LeftoverCreditsModal({
  leagueId,
  leagueName,
  participants,
}: LeftoverCreditsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [credits, setCredits] = useState<Record<string, number>>({});
  const [isPending, startTransition] = useTransition();

  const handleInputChange = (userId: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
      setCredits((prev) => {
        const newCredits = { ...prev };
        delete newCredits[userId];
        return newCredits;
      });
    } else {
      setCredits((prev) => ({ ...prev, [userId]: numValue }));
    }
  };

  const handleApply = () => {
    const entries = Object.entries(credits).filter(([, amount]) => amount !== 0);
    if (entries.length === 0) {
      toast.info("Nessuna modifica da applicare");
      return;
    }

    startTransition(async () => {
      const results = await Promise.all(
        entries.map(([userId, amount]) =>
          addLeftoverCreditsAction(leagueId, userId, amount)
        )
      );

      const successes = results.filter((r) => r.success).length;
      const failures = results.filter((r) => !r.success);

      if (failures.length === 0) {
        toast.success("Crediti aggiornati!", {
          description: `${successes} partecipant${successes > 1 ? "i" : "e"} aggiornat${successes > 1 ? "i" : "o"}.`,
        });
        setIsOpen(false);
        setCredits({});
      } else {
        toast.error("Alcuni aggiornamenti falliti", {
          description: failures.map((f) => f.message).join(", "),
        });
      }
    });
  };

  const totalToAdd = Object.values(credits).reduce((sum, val) => sum + val, 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Coins className="h-4 w-4" />
          Aggiungi Crediti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi Crediti Residui</DialogTitle>
          <DialogDescription>
            Aggiungi o sottrai crediti ai partecipanti della lega &quot;{leagueName}&quot;.
            Utile per trasferire crediti avanzati da aste precedenti.
          </DialogDescription>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Username</TableHead>
              <TableHead className="text-right">Budget Attuale</TableHead>
              <TableHead className="text-right w-[150px]">Crediti da Aggiungere</TableHead>
              <TableHead className="text-right">Nuovo Budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => {
              const toAdd = credits[p.userId] || 0;
              const newBudget = p.currentBudget + toAdd;
              return (
                <TableRow key={p.userId}>
                  <TableCell className="font-medium">
                    {p.teamName || "Da definire"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.username || "N/D"}
                  </TableCell>
                  <TableCell className="text-right">{p.currentBudget} cr</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          handleInputChange(p.userId, String((credits[p.userId] || 0) - 1))
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        className="w-20 text-center"
                        value={credits[p.userId] ?? ""}
                        onChange={(e) => handleInputChange(p.userId, e.target.value)}
                        placeholder="0"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          handleInputChange(p.userId, String((credits[p.userId] || 0) + 1))
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        toAdd > 0
                          ? "text-green-600 font-medium"
                          : toAdd < 0
                            ? "text-red-600 font-medium"
                            : ""
                      }
                    >
                      {newBudget} cr
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {totalToAdd !== 0 && (
          <div className="text-sm text-muted-foreground text-right">
            Totale crediti da {totalToAdd > 0 ? "aggiungere" : "sottrarre"}:{" "}
            <span className={totalToAdd > 0 ? "text-green-600" : "text-red-600"}>
              {totalToAdd > 0 ? "+" : ""}
              {totalToAdd} cr
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Annulla
          </Button>
          <Button onClick={handleApply} disabled={isPending || totalToAdd === 0}>
            {isPending ? "Applicazione..." : "Applica Modifiche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
