// src/components/admin/PlayerResetForm.tsx v.1.0
// Pulsante "Reset Players DB" per lo svuotamento del catalogo a inizio stagione.
// Richiede la digitazione di "RESET" come conferma, poi carica il nuovo listone
// con modalità replace (svuota catalogo + rose, poi importa il file).

"use client";

import { type FormEvent, useRef, useState } from "react";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PlayerResetForm() {
  const [isResetting, setIsResetting] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (confirmationText !== "RESET") {
      toast.error("Devi digitare RESET per confermare.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      toast.error("Nessun file selezionato o il file è vuoto.");
      return;
    }

    // Chiedi conferma finale (doppia conferma)
    if (
      !window.confirm(
        "ATTENZIONE: questo azzererà TUTTI i giocatori e TUTTE le rose (anche delle leghe esistenti), poi caricherà il nuovo listone. Sei sicuro?"
      )
    ) {
      return;
    }

    setIsResetting(true);

    try {
      // replaceMode=true → il servizio svuota catalogo + rose prima dell'import
      formData.set("replaceMode", "true");

      const response = await fetch("/api/admin/players/upload-excel", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Errore sconosciuto durante il reset."
        );
      }

      toast.success("Reset completato!", {
        description: `Catalogo svuotato (${result.deletedOrphans ?? 0} giocatori rimossi). Giocatori importati: ${result.successfullyUpserted ?? 0}.`,
      });
      setConfirmationText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Si è verificato un errore.";
      toast.error("Reset fallito", { description: errorMessage });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="mb-3 flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <h3 className="font-semibold text-destructive">
            Reset Players DB — SOLO inizio stagione
          </h3>
          <p className="text-sm text-muted-foreground">
            Azzera completamente il catalogo giocatori e tutte le rose
            (assegnazioni nelle leghe), poi carica il nuovo listone. Da usare
            esclusivamente al cambio di campionato:{" "}
            <strong>non usarlo a metà stagione</strong>, perché eliminerebbe i
            giocatori delle aste di riparazione.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="reset-player-file" className="text-sm">
            Nuovo listone (file Excel)
          </Label>
          <Input
            id="reset-player-file"
            name="file"
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            required
            disabled={isResetting}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="reset-confirmation" className="text-sm">
            Digita <code className="rounded bg-muted px-1">RESET</code> per
            confermare
          </Label>
          <Input
            id="reset-confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="RESET"
            autoComplete="off"
            disabled={isResetting}
            className="mt-1"
          />
        </div>

        <Button
          type="submit"
          variant="destructive"
          className="w-full"
          disabled={isResetting || confirmationText !== "RESET"}
        >
          {isResetting ? (
            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
          ) : (
            <>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Players DB
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
