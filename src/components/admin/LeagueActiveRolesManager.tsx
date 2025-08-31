// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.
"use client";

// 1. Importazioni
import { useActionState, useEffect, useState } from "react";

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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  type UpdateActiveRolesFormState,
  updateActiveRolesAction,
} from "@/lib/actions/league.actions";

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// src/components/admin/LeagueActiveRolesManager.tsx v.1.1
// Componente client per la gestione dei ruoli attivi in un'asta.

// 2. Props del componente
interface LeagueActiveRolesManagerProps {
  leagueId: number;
  currentActiveRoles: string | null; // Es. "P,D,C,A"
}
// 3. Componente per il bottone di submit
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-4 w-full">
      {pending ? "Aggiornamento..." : "Salva Ruoli Attivi"}
    </Button>
  );
}
// 4. Componente principale
export function LeagueActiveRolesManager({
  leagueId,
  currentActiveRoles,
}: LeagueActiveRolesManagerProps) {
  const initialState: UpdateActiveRolesFormState = {
    success: false,
    message: "",
  };
  const [state, formAction] = useActionState(
    updateActiveRolesAction,
    initialState
  );
  const allRoles = ["P", "D", "C", "A"];
  // Stato per gestire i ruoli selezionati
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    return currentActiveRoles ? currentActiveRoles.split(",") : [];
  });
  // Sincronizza lo stato quando le props cambiano
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
          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
