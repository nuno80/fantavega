// src/components/admin/DeleteLeague.tsx
// Componente per eliminare una lega con doppia conferma

"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Componenti UI
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  type DeleteLeagueFormState,
  deleteLeagueAction,
} from "@/lib/actions/league.actions";

interface DeleteLeagueProps {
  leagueId: number;
  leagueName: string;
  participantCount: number;
  isCreator: boolean;
}

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <Button type="submit" variant="destructive" disabled={isPending}>
      {isPending ? "Eliminando..." : "Elimina Definitivamente"}
    </Button>
  );
}

export function DeleteLeague({
  leagueId,
  leagueName,
  participantCount,
  isCreator,
}: DeleteLeagueProps) {
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = await deleteLeagueAction(
          { success: false, message: "" },
          formData
        );
        
        if (result.success) {
          toast.success("Successo!", { description: result.message });
          setIsDialogOpen(false);
          setShowFinalConfirm(false);
          setConfirmationText("");
        } else {
          toast.error("Errore", { description: result.message });
        }
      } catch (error) {
        toast.error("Errore", { 
          description: "Si è verificato un errore durante l'eliminazione" 
        });
      }
    });
  };

  // Solo il creatore può eliminare la lega
  if (!isCreator) {
    return null;
  }

  const handleFirstConfirm = () => {
    setShowFinalConfirm(true);
  };

  const handleCancel = () => {
    setShowFinalConfirm(false);
    setConfirmationText("");
  };

  const isConfirmationValid = confirmationText === "ELIMINA";

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Elimina Lega
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Elimina Lega
          </DialogTitle>
          <DialogDescription>
            Questa azione eliminerà definitivamente la lega e tutti i dati associati.
          </DialogDescription>
        </DialogHeader>

        {!showFinalConfirm ? (
          // Prima fase: Warning e informazioni
          <div className="space-y-4 py-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <h4 className="font-semibold text-destructive mb-2">
                ⚠️ ATTENZIONE: Questa azione è irreversibile!
              </h4>
              <div className="space-y-2 text-sm">
                <p><strong>Lega:</strong> {leagueName}</p>
                <p><strong>Partecipanti:</strong> {participantCount}</p>
              </div>
            </div>

            <div className="bg-muted rounded-lg p-4">
              <h5 className="font-medium mb-2">Verranno eliminati:</h5>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Tutti i partecipanti e le loro rose</li>
                <li>Tutte le aste e le offerte</li>
                <li>Tutte le transazioni di budget</li>
                <li>Tutti i dati storici della lega</li>
              </ul>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annulla</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleFirstConfirm}>
                Continua con l'Eliminazione
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // Seconda fase: Conferma finale con digitazione
          <form action={handleSubmit} className="space-y-4 py-4">
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="confirmationText" value={confirmationText} />

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm font-medium text-destructive mb-3">
                Per confermare l'eliminazione, digita esattamente: <code className="bg-background px-1 rounded">ELIMINA</code>
              </p>
              
              <Label htmlFor="confirmText">Conferma eliminazione</Label>
              <Input
                id="confirmText"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Digita ELIMINA"
                className="mt-1"
                autoComplete="off"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Annulla
              </Button>
              <SubmitButton isPending={isPending} />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}