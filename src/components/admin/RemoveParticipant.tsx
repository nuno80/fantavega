// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

"use client";

// 1. Importazioni
import { useTransition } from "react";

import { Trash2 } from "lucide-react";
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
import { removeParticipantAction } from "@/lib/actions/league.actions";

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// src/components/admin/RemoveParticipant.tsx v.1.0
// Componente client per la rimozione di un partecipante da una lega.

// 2. Props del componente
interface RemoveParticipantProps {
  leagueId: number;
  participantUserId: string;
  participantUsername: string | null;
}

// 3. Componente per il bottone di submit
function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <AlertDialogAction
      type="submit"
      disabled={isPending}
      className="bg-red-600 hover:bg-red-700"
    >
      {isPending ? "Rimozione..." : "Sì, rimuovi"}
    </AlertDialogAction>
  );
}

// 4. Componente principale
export function RemoveParticipant({
  leagueId,
  participantUserId,
  participantUsername,
}: RemoveParticipantProps) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = await removeParticipantAction(
          { success: false, message: "" },
          formData
        );

        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error("Errore", { description: result.message });
        }
      } catch (_error) {
        toast.error("Errore", {
          description: "Si è verificato un errore durante la rimozione",
        });
      }
    });
  };

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
        <form action={handleSubmit}>
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
              . Questa operazione è permessa solo prima dell&apos;inizio
              dell&apos;asta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <SubmitButton isPending={isPending} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
