"use client";

/**
 * Modal per l'importazione delle rose da file CSV.
 * Usa il servizio roster-import.service.ts esistente.
 */

import { AlertCircle, CheckCircle2, FileText, Upload } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { importRosterFromCsvAction } from "@/lib/actions/league.actions";

// Tipo per la fonte del prezzo (deve matchare quello del servizio)
type PriceSource = "csv" | "database";

interface CsvImportModalProps {
  leagueId: number;
  leagueName: string;
  participantsCount: number;
}

interface ValidationPreview {
  totalEntries: number;
  validEntries: number;
  skippedEntries: number;
  teams: string[];
  warnings: string[];
  errors: string[];
}

export function CsvImportModal({
  leagueId,
  leagueName,
  participantsCount,
}: CsvImportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ValidationPreview | null>(null);
  const [priceSource, setPriceSource] = useState<PriceSource>("csv");
  const [isPending, startTransition] = useTransition();

  // Parsing locale per preview
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);

      // Preview locale del parsing
      const lines = content.trim().split("\n");
      const entries: { teamName: string; playerId: number; price: number }[] = [];
      const teams = new Set<string>();
      let skipped = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^\$[\s,\t]*\$[\s,\t]*\$/.test(trimmed)) continue;

        const delimiter = trimmed.includes("\t") ? "\t" : ",";
        const parts = trimmed.split(delimiter).map((p) => p.trim());

        if (parts.length < 3) {
          skipped++;
          continue;
        }

        const [teamName, playerIdStr, priceStr] = parts;
        const playerId = parseInt(playerIdStr, 10);
        const price = parseInt(priceStr, 10);

        if (!teamName || isNaN(playerId) || isNaN(price)) {
          skipped++;
          continue;
        }

        entries.push({ teamName, playerId, price });
        teams.add(teamName);
      }

      setPreview({
        totalEntries: entries.length + skipped,
        validEntries: entries.length,
        skippedEntries: skipped,
        teams: Array.from(teams),
        warnings: [],
        errors: [],
      });
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!csvContent) return;

    startTransition(async () => {
      const result = await importRosterFromCsvAction(leagueId, csvContent, priceSource);

      if (result.success) {
        toast.success("Import completato!", {
          description: `${result.playersImported} giocatori importati per ${result.teamsImported} team.`,
        });
        setIsOpen(false);
        setCsvContent(null);
        setFileName(null);
        setPreview(null);
      } else {
        toast.error("Errore durante l'import", {
          description: result.errors?.join(", ") || result.message,
        });
        // Aggiorna preview con errori dal server
        if (result.errors || result.warnings) {
          setPreview((prev) =>
            prev
              ? { ...prev, errors: result.errors || [], warnings: result.warnings || [] }
              : null
          );
        }
      }
    });
  };

  const resetState = () => {
    setCsvContent(null);
    setFileName(null);
    setPreview(null);
    setPriceSource("csv");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetState();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Importa Rose CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importa Rose da CSV</DialogTitle>
          <DialogDescription>
            Carica un file CSV esportato dal Fantacalcio per importare le rose nella lega &quot;{leagueName}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info box */}
          <div className="flex gap-3 p-4 border rounded-lg bg-muted/50">
            <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-sm">Requisiti per l&apos;import</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground mt-1">
                <li>I nomi team nel CSV devono corrispondere ai nomi squadra dei partecipanti</li>
                <li>Gli ID giocatori devono esistere nel database</li>
                <li>Partecipanti attuali: <strong className="text-foreground">{participantsCount}</strong></li>
              </ul>
            </div>
          </div>

          {/* File input */}
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
              id="csv-file-input"
            />
            <label
              htmlFor="csv-file-input"
              className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted transition-colors"
            >
              <FileText className="h-4 w-4" />
              {fileName || "Seleziona file CSV..."}
            </label>
            {fileName && (
              <Button variant="ghost" size="sm" onClick={resetState}>
                Rimuovi
              </Button>
            )}
          </div>

          {/* Price source selection */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium">Sorgente Prezzo di Acquisto</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Scegli da dove prendere i prezzi per i giocatori importati
                </p>
              </div>
              <Select
                value={priceSource}
                onValueChange={(value: "csv" | "database") => setPriceSource(value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">Prezzi dal CSV</SelectItem>
                  <SelectItem value="database">Quotazioni attuali</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="space-y-3 p-4 bg-muted rounded-lg">
              <h4 className="font-medium">Anteprima Import</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Righe totali:</span>
                  <span className="ml-2 font-medium">{preview.totalEntries}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valide:</span>
                  <span className="ml-2 font-medium text-green-600">{preview.validEntries}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Saltate:</span>
                  <span className="ml-2 font-medium text-yellow-600">{preview.skippedEntries}</span>
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Team trovati ({preview.teams.length}):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {preview.teams.slice(0, 10).map((team) => (
                    <span key={team} className="px-2 py-0.5 bg-primary/10 rounded text-xs">
                      {team}
                    </span>
                  ))}
                  {preview.teams.length > 10 && (
                    <span className="px-2 py-0.5 bg-muted-foreground/10 rounded text-xs">
                      +{preview.teams.length - 10} altri
                    </span>
                  )}
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="flex gap-3 p-3 border border-destructive/50 rounded-lg bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm text-destructive">Errori</h4>
                    <ul className="list-disc list-inside text-sm text-destructive/80">
                      {preview.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="flex gap-3 p-3 border border-yellow-500/50 rounded-lg bg-yellow-500/10">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm text-yellow-700">Avvisi ({preview.warnings.length})</h4>
                    <ul className="list-disc list-inside text-sm text-yellow-600/80">
                      {preview.warnings.slice(0, 3).map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleImport}
            disabled={!csvContent || isPending}
            className="gap-2"
          >
            {isPending ? (
              "Importazione..."
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Conferma Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
