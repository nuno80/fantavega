// src/components/admin/LeagueStatusManager.tsx v.1.3
// FIX: Select Radix non serializza il valore nel FormData → hidden input + stato locale.
// FIX: usa isPending da useActionState invece di useFormStatus separato
"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

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

interface LeagueStatusManagerProps {
  leagueId: number;
  currentStatus: string;
}

export function LeagueStatusManager({
  leagueId,
  currentStatus,
}: LeagueStatusManagerProps) {
  const initialState: UpdateStatusFormState = { success: false, message: "" };
  // FIX: useActionState ritorna isPending come terzo valore
  const [state, formAction, isPending] = useActionState(
    updateLeagueStatusAction,
    initialState
  );
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  // Sincronizza il select se lo stato corrente cambia dall'esterno (es. dopo submit)
  useEffect(() => {
    setSelectedStatus(currentStatus);
  }, [currentStatus]);

  // Al submit scrive SEMPRE il valore selezionato nell'hidden input, così
  // anche se lo stato React fosse desincronizzato il FormData è corretto.
  const handleFormAction = (formData: FormData) => {
    formData.set("newStatus", selectedStatus);
    formAction(formData);
  };

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
        <form action={handleFormAction} className="flex items-center gap-4">
          <input type="hidden" name="leagueId" value={leagueId} />
          <div className="flex-grow">
            {/* Nota: il Select di Radix non serializza il valore nel FormData,
                quindi serve un hidden input che segue lo stato selezionato. */}
            <input type="hidden" name="newStatus" value={selectedStatus} />
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
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
          <Button type="submit" disabled={isPending}>
            {isPending ? "Aggiornamento..." : "Aggiorna Stato"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
