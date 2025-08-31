// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

"use client";

// 1. Importazioni
import { useActionState, useEffect, useState } from "react";

import { Pencil } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

// Componenti UI
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type UpdateTeamNameFormState,
  updateTeamNameAction,
} from "@/lib/actions/league.actions";

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// src/components/admin/EditTeamName.tsx v.1.0
// Componente client per modificare il nome della squadra di un partecipante.

// 2. Props del componente
interface EditTeamNameProps {
  leagueId: number;
  participantUserId: string;
  currentTeamName: string | null;
}

// 3. Componente per il bottone di submit
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvataggio..." : "Salva"}
    </Button>
  );
}

// 4. Componente principale
export function EditTeamName({
  leagueId,
  participantUserId,
  currentTeamName,
}: EditTeamNameProps) {
  const initialState: UpdateTeamNameFormState = { success: false, message: "" };
  const [state, formAction] = useActionState(
    updateTeamNameAction,
    initialState
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success(state.message);
        setIsOpen(false); // Chiudi il popover in caso di successo
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="ml-2 h-6 w-6">
          <Pencil className="h-4 w-4" />
          <span className="sr-only">Modifica nome squadra</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input
            type="hidden"
            name="participantUserId"
            value={participantUserId}
          />
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Modifica Nome Squadra</h4>
            <p className="text-sm text-muted-foreground">
              Inserisci il nuovo nome per la squadra.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newTeamName">Nuovo Nome</Label>
            <Input
              id="newTeamName"
              name="newTeamName"
              defaultValue={currentTeamName || ""}
              className="col-span-2 h-8"
              required
            />
          </div>
          <SubmitButton />
        </form>
      </PopoverContent>
    </Popover>
  );
}
