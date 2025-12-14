// src/components/admin/EditLeagueSetting.tsx v.1.0
// Componente client per modificare un'impostazione della lega.

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type UpdateLeagueSettingFormState,
  updateLeagueSettingAction,
} from "@/lib/actions/league.actions";

// 2. Props del componente
type SettingType = "number" | "text" | "select";

interface SelectOption {
  value: string;
  label: string;
}

interface EditLeagueSettingProps {
  leagueId: number;
  settingName: string;
  settingLabel: string;
  currentValue: string | number;
  inputType?: SettingType;
  selectOptions?: SelectOption[];
  unit?: string; // es. "cr", "min"
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
export function EditLeagueSetting({
  leagueId,
  settingName,
  settingLabel,
  currentValue,
  inputType = "text",
  selectOptions,
  unit,
}: EditLeagueSettingProps) {
  const initialState: UpdateLeagueSettingFormState = { success: false, message: "" };
  const [state, formAction] = useActionState(
    updateLeagueSettingAction,
    initialState
  );
  const [isOpen, setIsOpen] = useState(false);
  const [selectValue, setSelectValue] = useState(String(currentValue));

  useEffect(() => {
    if (state && state.message) {
      if (state.success) {
        toast.success(state.message);
        setIsOpen(false);
      } else {
        toast.error("Errore", { description: state.message });
      }
    }
  }, [state]);

  // Reset del valore select quando il popover si chiude
  useEffect(() => {
    if (!isOpen) {
      setSelectValue(String(currentValue));
    }
  }, [isOpen, currentValue]);

  const handleSelectSubmit = () => {
    const form = document.getElementById(`form-${settingName}`) as HTMLFormElement;
    if (form) {
      form.requestSubmit();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 hover:opacity-100">
          <Pencil className="h-3 w-3" />
          <span className="sr-only">Modifica {settingLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form id={`form-${settingName}`} action={formAction} className="grid gap-4">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="settingName" value={settingName} />

          <div className="space-y-2">
            <h4 className="font-medium leading-none">Modifica {settingLabel}</h4>
            <p className="text-sm text-muted-foreground">
              Inserisci il nuovo valore{unit ? ` (${unit})` : ""}.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`newValue-${settingName}`}>Nuovo Valore</Label>

            {inputType === "select" && selectOptions ? (
              <>
                <input type="hidden" name="newValue" value={selectValue} />
                <Select
                  value={selectValue}
                  onValueChange={(value) => {
                    setSelectValue(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona..." />
                  </SelectTrigger>
                  <SelectContent>
                    {selectOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Input
                id={`newValue-${settingName}`}
                name="newValue"
                type={inputType === "number" ? "number" : "text"}
                defaultValue={currentValue}
                className="col-span-2 h-8"
                required
                min={inputType === "number" ? 1 : undefined}
              />
            )}
          </div>

          {inputType === "select" ? (
            <Button type="button" size="sm" onClick={handleSelectSubmit}>
              Salva
            </Button>
          ) : (
            <SubmitButton />
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}
