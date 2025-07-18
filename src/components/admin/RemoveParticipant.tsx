// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

"use client";

// 1. Importazioni
import { useActionState, useEffect } from "react";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

// Componenti UI
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
import { Button } from "@/components/ui/button";
import {
  type RemoveParticipantFormState,
  removeParticipantAction,
} from "@/lib/actions/league.actions";

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// 2. Props del componente
interface RemoveParticipantProps {
  leagueId: number;
  participantUserId: string;
  participantUsername: string | null;
}

// 3. Componente per il bottone di submit
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction
      type="submit"
      disabled={pending}
      className="bg-red-600 hover:bg-red-700"
    >
      {pending ? "Rimozione..." : "Sì, rimuovi"}
    </AlertDialogAction>
  );
}

// 4. Componente principale
export function RemoveParticipant({
  leagueId,
  participantUserId,
  participantUsername,
}: RemoveParticipantProps) {
  const initialState: RemoveParticipantFormState = {
    success: false,
    message: "",
  };
  const [state, formAction] = useActionState(
    removeParticipantAction,
    initialState
  );

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success(state.message);
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-500 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Rimuovi partecipante</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input
            type="hidden"
            name="participantUserId"
            value={participantUserId}
          />
          <AlertDialogHeader>
            <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Verranno rimosse tutte le offerte,
              i giocatori assegnati e la cronologia del budget per l&apos;utente{" "}
              <span className="font-bold">
                {participantUsername || participantUserId}
              </span>
              . Questa operazione è permessa solo prima dell&apos;inizio dell&apos;asta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <SubmitButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
