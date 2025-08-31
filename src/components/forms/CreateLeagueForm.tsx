// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

"use client";

// 1. Importazioni
import { useActionState, useEffect, useState } from "react";

// <-- useActionState da 'react'
import { useFormStatus } from "react-dom";
// <-- useFormStatus da 'react-dom'
import { toast } from "sonner";

// Componenti UI da shadcn
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLeague } from "@/lib/actions/league.actions";

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// Define FormState type locally
type FormState = {
  success: boolean;
  message: string;
  errors?: {
    name?: string[];
    description?: string[];
    max_participants?: string[];
    initial_budget?: string[];
    min_bid?: string[];
    timer_duration_minutes?: string[];
    slots_P?: string[];
    slots_D?: string[];
    slots_C?: string[];
    slots_A?: string[];
  };
};

// src/components/forms/CreateLeagueForm.tsx v.1.2
// Correzione definitiva: useActionState importato da 'react' e useFormStatus da 'react-dom'.

// 2. Componente per il bottone di submit (invariato)
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creazione in corso..." : "Crea Lega"}
    </Button>
  );
}

// 3. Componente Form principale (invariato nella logica)
export function CreateLeagueForm() {
  const initialState: FormState = { success: false, message: "" };
  const [state, formAction] = useActionState(createLeague, initialState);

  const [minBidRule, setMinBidRule] = useState<"fixed" | "percentage">("fixed");

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
    <Card className="mx-auto w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Crea una Nuova Lega</CardTitle>
        <CardDescription>
          Inserisci i dettagli per configurare la tua nuova lega d&apos;asta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {/* Sezione Dettagli Principali */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="name">Nome Lega</Label>
              <Input id="name" name="name" required />
              {state.errors?.name && (
                <p className="mt-1 text-sm text-red-500">
                  {state.errors.name[0]}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="league_type">Tipo Lega</Label>
              <Select name="league_type" defaultValue="classic">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="mantra">Mantra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sezione Budget e Timer */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="initial_budget_per_manager">
                Budget Iniziale (per manager)
              </Label>
              <Input
                id="initial_budget_per_manager"
                name="initial_budget_per_manager"
                type="number"
                defaultValue="500"
                required
              />
              {state.errors?.initial_budget_per_manager && (
                <p className="mt-1 text-sm text-red-500">
                  {state.errors.initial_budget_per_manager[0]}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="timer_duration_minutes">
                Durata Timer Asta (minuti)
              </Label>
              <Input
                id="timer_duration_minutes"
                name="timer_duration_minutes"
                type="number"
                defaultValue="1440"
                required
              />
              {state.errors?.timer_duration_minutes && (
                <p className="mt-1 text-sm text-red-500">
                  {state.errors.timer_duration_minutes[0]}
                </p>
              )}
            </div>
          </div>

          {/* Sezione Offerta Minima */}
          <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="min_bid_rule">Regola Offerta Minima</Label>
              <Select
                name="min_bid_rule"
                defaultValue="fixed"
                onValueChange={(value) =>
                  setMinBidRule(value as "fixed" | "percentage")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Offerta Fissa</SelectItem>
                  <SelectItem value="player_quotation">
                    Quotazione Giocatore
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {minBidRule === "fixed" && (
              <div>
                <Label htmlFor="min_bid">Valore Offerta Minima</Label>
                <Input
                  id="min_bid"
                  name="min_bid"
                  type="number"
                  defaultValue="1"
                  required
                />
                {state.errors?.min_bid && (
                  <p className="mt-1 text-sm text-red-500">
                    {state.errors.min_bid[0]}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Sezione Slot Giocatori */}
          <div>
            <h3 className="mb-2 text-lg font-medium">Slot per Ruolo</h3>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <Label htmlFor="slots_P">Portieri (P)</Label>
                <Input
                  id="slots_P"
                  name="slots_P"
                  type="number"
                  defaultValue="3"
                  required
                />
                {state.errors?.slots_P && (
                  <p className="mt-1 text-sm text-red-500">
                    {state.errors.slots_P[0]}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="slots_D">Difensori (D)</Label>
                <Input
                  id="slots_D"
                  name="slots_D"
                  type="number"
                  defaultValue="8"
                  required
                />
                {state.errors?.slots_D && (
                  <p className="mt-1 text-sm text-red-500">
                    {state.errors.slots_D[0]}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="slots_C">Centrocampisti (C)</Label>
                <Input
                  id="slots_C"
                  name="slots_C"
                  type="number"
                  defaultValue="8"
                  required
                />
                {state.errors?.slots_C && (
                  <p className="mt-1 text-sm text-red-500">
                    {state.errors.slots_C[0]}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="slots_A">Attaccanti (A)</Label>
                <Input
                  id="slots_A"
                  name="slots_A"
                  type="number"
                  defaultValue="6"
                  required
                />
                {state.errors?.slots_A && (
                  <p className="mt-1 text-sm text-red-500">
                    {state.errors.slots_A[0]}
                  </p>
                )}
              </div>
            </div>
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
