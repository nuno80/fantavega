// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

"use client";

// 1. Importazioni
// <-- NUOVA IMPORTAZIONE
import { useActionState, useEffect, useRef } from "react";

import { PlusCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

// Componenti UI
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AddParticipantFormState,
  addParticipantAction,
} from "@/lib/actions/league.actions";
import { type EligibleUser } from "@/lib/db/services/user.service";

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// src/components/forms/AddParticipantForm.tsx v.1.1
// Aggiornato per mostrare nome e cognome nel dropdown degli utenti.

// 2. Props del componente (aggiornate)
interface AddParticipantFormProps {
  leagueId: number;
  eligibleUsers: EligibleUser[]; // <-- Usa il nuovo tipo
}

// 3. Componente per il bottone di submit (invariato)
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Aggiungendo..." : "Aggiungi Partecipante"}
    </Button>
  );
}

// 4. Componente Form principale
export function AddParticipantForm({
  leagueId,
  eligibleUsers,
}: AddParticipantFormProps) {
  const initialState: AddParticipantFormState = { success: false, message: "" };
  const [state, formAction] = useActionState(
    addParticipantAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success("Successo!", { description: state.message });
        formRef.current?.reset();
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Aggiungi Partecipante
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi un nuovo manager</DialogTitle>
          <DialogDescription>
            Seleziona un utente e assegna un nome alla sua squadra.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="space-y-4 py-4">
          <input type="hidden" name="leagueId" value={leagueId} />

          {/* Selezione Utente (MODIFICATA) */}
          <div>
            <Label htmlFor="userIdToAdd">Utente</Label>
            {eligibleUsers.length > 0 ? (
              <Select name="userIdToAdd" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un utente..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((user) => {
                    // Costruisce un nome leggibile, con fallback migliorato
                    let displayName = "";

                    // Prova prima nome e cognome
                    if (user.firstName || user.lastName) {
                      displayName = [user.firstName, user.lastName]
                        .filter(Boolean)
                        .join(" ");
                    }

                    // Se non ha nome/cognome, usa username
                    if (!displayName && user.username) {
                      displayName = user.username;
                    }

                    // Ultimo fallback: mostra ID ma in formato piu leggibile
                    if (!displayName) {
                      displayName = `Utente ${user.id.slice(-8)}`;
                    }

                    return (
                      <SelectItem key={user.id} value={user.id}>
                        {displayName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <p className="pt-2 text-sm text-muted-foreground">
                Nessun altro utente idoneo da aggiungere.
              </p>
            )}
          </div>

          {/* Nome Squadra */}
          <div>
            <Label htmlFor="teamName">Nome Squadra</Label>
            <Input
              id="teamName"
              name="teamName"
              placeholder="Es. Real Madrink"
              required
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Annulla
              </Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
