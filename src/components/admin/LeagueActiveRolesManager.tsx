// src/components/admin/LeagueActiveRolesManager.tsx v.1.2
// FIX: Usa isPending da useActionState invece di useFormStatus separato
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  type UpdateActiveRolesFormState,
  updateActiveRolesAction,
} from "@/lib/actions/league.actions";

interface LeagueActiveRolesManagerProps {
  leagueId: number;
  currentActiveRoles: string | null;
}

export function LeagueActiveRolesManager({
  leagueId,
  currentActiveRoles,
}: LeagueActiveRolesManagerProps) {
  const initialState: UpdateActiveRolesFormState = {
    success: false,
    message: "",
  };
  // FIX: useActionState ritorna isPending come terzo valore
  const [state, formAction, isPending] = useActionState(
    updateActiveRolesAction,
    initialState
  );

  const allRoles = ["P", "D", "C", "A"];
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    return currentActiveRoles ? currentActiveRoles.split(",") : [];
  });

  useEffect(() => {
    setSelectedRoles(currentActiveRoles ? currentActiveRoles.split(",") : []);
  }, [currentActiveRoles]);

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success("Successo!", { description: state.message });
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  const handleRoleChange = (role: string, checked: boolean) => {
    setSelectedRoles((prev) => {
      if (checked) {
        return [...prev, role];
      } else {
        return prev.filter((r) => r !== role);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestione Ruoli Asta</CardTitle>
        <CardDescription>
          Seleziona quali ruoli sono attualmente disponibili per le offerte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <div className="grid grid-cols-2 gap-4">
            {allRoles.map((role) => (
              <div key={role} className="flex items-center space-x-2">
                <Checkbox
                  id={`role-${role}`}
                  name="active_roles"
                  value={role}
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={(checked) =>
                    handleRoleChange(role, !!checked)
                  }
                />
                <Label
                  htmlFor={`role-${role}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {role === "P" && "Portieri"}
                  {role === "D" && "Difensori"}
                  {role === "C" && "Centrocampisti"}
                  {role === "A" && "Attaccanti"}
                </Label>
              </div>
            ))}
          </div>
          <Button type="submit" disabled={isPending} className="mt-4 w-full">
            {isPending ? "Aggiornamento..." : "Salva Ruoli Attivi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
