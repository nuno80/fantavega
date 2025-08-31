// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

"use client";

// 1. Importazioni
import { type FormEvent, useRef, useState } from "react";

import { Upload } from "lucide-react";
import { toast } from "sonner";

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

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// src/components/admin/PlayerImportForm.tsx v.1.2 (Definitivo)
// Versione robusta che usa il comportamento nativo del form per l'upload.

// 2. Componente principale
export function PlayerImportForm() {
  const [isUploading, setIsUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      toast.error("Nessun file selezionato o il file è vuoto.");
      return;
    }

    setIsUploading(true);

    try {
      const response = await fetch("/api/admin/players/upload-excel", {
        method: "POST",
        body: formData, // Invia l'intero formData, che contiene il file
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Errore sconosciuto durante l'upload."
        );
      }

      toast.success("Upload completato con successo!", {
        description: `Giocatori processati: ${result.processedCount}. Creati: ${result.createdCount}, Aggiornati: ${result.updatedCount}.`,
      });
      formRef.current?.reset();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Si è verificato un errore.";
      toast.error("Upload fallito", { description: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Importazione Giocatori da File</CardTitle>
        <CardDescription>
          Carica un file Excel (.xlsx, .xls, .csv) per creare o aggiornare la
          lista dei giocatori.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* L'attributo 'encType' è fondamentale per l'upload di file */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          encType="multipart/form-data"
          className="space-y-6"
        >
          <div>
            <Label htmlFor="player-file" className="text-base">
              Seleziona il file
            </Label>
            <Input
              id="player-file"
              name="file" // Il 'name' deve corrispondere a quello che l'API si aspetta
              type="file"
              accept=".xlsx, .xls, .csv"
              className="mt-2 w-full file:mr-4 file:rounded-full file:border-0 file:bg-primary-foreground file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/10"
              required
              disabled={isUploading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isUploading}>
            {isUploading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Carica e Processa File
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
