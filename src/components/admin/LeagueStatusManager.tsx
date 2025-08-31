// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

"use client";

// 1. Importazioni
import { useActionState, useEffect } from "react";

import { useFormStatus } from "react-dom";
import { toast } from "sonner";

// Componenti UI
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type UpdateStatusFormState,
  updateLeagueStatusAction,
} from "@/lib/actions/league.actions";

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// src/components/admin/LeagueStatusManager.tsx v.1.1
// Aggiornato con la lista di stati della lega semplificata.

// 2. Props del componente (invariate)
interface LeagueStatusManagerProps {
  leagueId: number;
  currentStatus: string;
}

// 3. Componente per il bottone di submit (invariato)
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Aggiornamento..." : "Aggiorna Stato"}
    </Button>
  );
}

// 4. Componente principale
export function LeagueStatusManager({
  leagueId,
  currentStatus,
}: LeagueStatusManagerProps) {
  const initialState: UpdateStatusFormState = { success: false, message: "" };
  const [state, formAction] = useActionState(
    updateLeagueStatusAction,
    initialState
  );

  // CORREZIONE: Array degli stati possibili semplificato
  const possibleStates = [
    { value: "participants_joining", label: "Iscrizioni Aperte" },
    { value: "draft_active", label: "Asta Iniziale" },
    { value: "repair_active", label: "Asta di Riparazione" },
    { value: "market_closed", label: "Mercato Chiuso" },
    { value: "completed", label: "Conclusa" },
  ];

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success("Successo!", { description: state.message });
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestione Stato Lega</CardTitle>
        <CardDescription>
          Cambia la fase attuale della lega. Lo stato attuale è:{" "}
          <span className="font-bold capitalize">
            {currentStatus.replace(/_/g, " ")}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex items-center gap-4">
          <input type="hidden" name="leagueId" value={leagueId} />
          <div className="flex-grow">
            <Select name="newStatus" defaultValue={currentStatus} required>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un nuovo stato..." />
              </SelectTrigger>
              <SelectContent>
                {possibleStates.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
