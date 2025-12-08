"use client";

import { redirect } from "next/navigation";
import { useEffect, useState } from "react";

import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface League {
  id: number;
  name: string;
  status: string;
  league_type: string;
}

interface TeamSummary {
  team: string;
  players: number;
  totalSpent: number;
}

interface ImportValidation {
  success: boolean;
  dryRun?: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    totalEntries: number;
    validEntries: number;
    skippedEntries: number;
    teams: string[];
  };
}

interface ImportResult {
  success: boolean;
  teamsImported?: number;
  playersImported?: number;
  warnings: string[];
  summary?: TeamSummary[];
}

type ExportFormat = "csv" | "excel" | "custom";

export default function TeamsExportPage() {
  const { user, isLoaded } = useUser();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Export state
  const [selectedExportLeagueId, setSelectedExportLeagueId] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const [selectedImportLeagueId, setSelectedImportLeagueId] = useState<string>("");
  const [csvContent, setCsvContent] = useState<string>("");
  const [priceSource, setPriceSource] = useState<"csv" | "database">("csv");
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportValidation | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Check user authentication and role
  useEffect(() => {
    if (isLoaded && user) {
      const userRole = (user.publicMetadata?.role as string) || "user";
      if (userRole !== "admin") {
        redirect("/no-access");
      }
    } else if (isLoaded && !user) {
      redirect("/devi-autenticarti");
    }
  }, [user, isLoaded]);

  // Fetch leagues
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/admin/leagues", {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to fetch leagues");
        const data = await response.json();
        setLeagues(data.leagues || []);
      } catch {
        toast.error("Errore nel caricamento delle leghe");
      } finally {
        setIsLoading(false);
      }
    };
    if (user) fetchLeagues();
  }, [user]);

  // Filter leagues that can be imported (only 'participants_joining' status)
  const importableLeagues = leagues.filter(
    (l) => l.status === "participants_joining"
  );

  const handleExport = async () => {
    if (!selectedExportLeagueId) {
      toast.error("Seleziona una lega prima di esportare.");
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/admin/teams-export?leagueId=${selectedExportLeagueId}&format=${selectedFormat}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore durante l'esportazione");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition");
      let fileName = "export.dat";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          fileName = match[1];
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Esportazione completata con successo!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error(`Esportazione fallita: ${errorMessage}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleValidate = async () => {
    if (!selectedImportLeagueId) {
      toast.error("Seleziona una lega prima di validare.");
      return;
    }
    if (!csvContent.trim()) {
      toast.error("Inserisci il contenuto CSV.");
      return;
    }

    setIsValidating(true);
    setValidationResult(null);
    setImportResult(null);

    try {
      const response = await fetch("/api/admin/teams-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId: parseInt(selectedImportLeagueId, 10),
          csvContent,
          dryRun: true,
          priceSource,
        }),
      });

      const data = await response.json();
      setValidationResult(data);

      if (data.success) {
        toast.success("Validazione completata: dati pronti per l'import!");
      } else {
        toast.error("Validazione fallita: controlla gli errori.");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error(`Errore validazione: ${errorMessage}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!selectedImportLeagueId || !csvContent.trim()) return;

    setIsImporting(true);

    try {
      const response = await fetch("/api/admin/teams-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId: parseInt(selectedImportLeagueId, 10),
          csvContent,
          dryRun: false,
          priceSource,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setImportResult(data);
        setValidationResult(null);
        toast.success(
          `Import completato! ${data.teamsImported} team, ${data.playersImported} giocatori.`
        );
        setCsvContent("");
      } else {
        toast.error(`Import fallito: ${data.errors?.join(", ") || "Errore"}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast.error(`Errore import: ${errorMessage}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container flex min-h-[400px] items-center justify-center px-4 py-6">
          <div className="text-muted-foreground">Caricamento...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">Gestione Rose</h1>
        <div className="mx-auto w-full lg:w-5/6">
          <AdminQuickActions />
        </div>

        <div className="mx-auto w-full max-w-3xl">
          <Tabs defaultValue="export" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="export" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Esporta
              </TabsTrigger>
              <TabsTrigger value="import" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Importa
              </TabsTrigger>
            </TabsList>

            {/* TAB ESPORTA */}
            <TabsContent value="export">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Esporta Rose
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Lega</label>
                      <Select
                        value={selectedExportLeagueId}
                        onValueChange={setSelectedExportLeagueId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona una lega..." />
                        </SelectTrigger>
                        <SelectContent>
                          {leagues.map((league) => (
                            <SelectItem
                              key={league.id}
                              value={league.id.toString()}
                            >
                              {league.name} ({league.league_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Formato</label>
                      <Select
                        value={selectedFormat}
                        onValueChange={(v) =>
                          setSelectedFormat(v as ExportFormat)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona un formato..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csv">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <span>CSV Standard</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="excel">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="h-4 w-4" />
                              <span>Excel (.xlsx)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="custom">
                            <div className="flex items-center gap-2">
                              <FileCode className="h-4 w-4" />
                              <span>Testo Personalizzato</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    onClick={handleExport}
                    disabled={!selectedExportLeagueId || isExporting}
                    className="w-full"
                  >
                    {isExporting ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                        Esportazione in corso...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Esporta Dati
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB IMPORTA */}
            <TabsContent value="import">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Importa Rose da CSV
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Selezione Lega */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Lega Destinazione
                    </label>
                    <Select
                      value={selectedImportLeagueId}
                      onValueChange={(v) => {
                        setSelectedImportLeagueId(v);
                        setValidationResult(null);
                        setImportResult(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona una lega..." />
                      </SelectTrigger>
                      <SelectContent>
                        {importableLeagues.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">
                            Nessuna lega in stato &quot;participants_joining&quot;
                          </div>
                        ) : (
                          importableLeagues.map((league) => (
                            <SelectItem
                              key={league.id}
                              value={league.id.toString()}
                            >
                              {league.name} ({league.league_type})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Solo leghe in stato &quot;iscrizioni aperte / participants_joining&quot; possono ricevere import.
                    </p>
                  </div>

                  {/* Upload File CSV */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Carica File CSV
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              setCsvContent(content);
                              setValidationResult(null);
                              setImportResult(null);
                              toast.success(`File "${file.name}" caricato!`);
                            };
                            reader.onerror = () => {
                              toast.error("Errore nella lettura del file");
                            };
                            reader.readAsText(file);
                          }
                        }}
                        className="flex-1 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Oppure incolla il contenuto direttamente nella textarea sotto.
                    </p>
                  </div>

                  {/* Fonte Prezzo */}
                  <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
                    <label className="text-sm font-medium">
                      Fonte Prezzo Acquisto
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="priceSource"
                          value="csv"
                          checked={priceSource === "csv"}
                          onChange={() => setPriceSource("csv")}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">
                          <strong>File CSV</strong> - Usa i prezzi indicati nel file
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="priceSource"
                          value="database"
                          checked={priceSource === "database"}
                          onChange={() => setPriceSource("database")}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="text-sm">
                          <strong>Quotazione DB</strong> - Usa la quotazione attuale dal database
                        </span>
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {priceSource === "csv"
                        ? "I giocatori saranno importati con il prezzo indicato nel CSV."
                        : "I giocatori saranno importati con la loro quotazione attuale dal database (Qt.A)."}
                    </p>
                  </div>

                  {/* Textarea CSV */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Contenuto CSV
                    </label>
                    <Textarea
                      value={csvContent}
                      onChange={(e) => {
                        setCsvContent(e.target.value);
                        setValidationResult(null);
                        setImportResult(null);
                      }}
                      placeholder={`Il contenuto del file apparirà qui, oppure incolla manualmente...

Esempio formato:
$	$	$
Fede	761	22
Fede	6966	28
$	$	$
nuno	7042	3`}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Formati supportati: TAB-separated o comma-separated.
                      Separatore team: $ $ $
                    </p>
                  </div>

                  {/* Pulsanti */}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleValidate}
                      disabled={
                        !selectedImportLeagueId ||
                        !csvContent.trim() ||
                        isValidating
                      }
                      variant="outline"
                      className="flex-1"
                    >
                      {isValidating ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                          Validazione...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Valida Dati
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleImport}
                      disabled={
                        !validationResult?.success ||
                        isImporting
                      }
                      className="flex-1"
                    >
                      {isImporting ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                          Importazione...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Importa Rose
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Risultato Validazione */}
                  {validationResult && (
                    <div
                      className={`rounded-lg border p-4 ${validationResult.success
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-red-500/50 bg-red-500/10"
                        }`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {validationResult.success ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                            <span className="text-green-700 dark:text-green-400">
                              Validazione OK
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <span className="text-red-700 dark:text-red-400">
                              Validazione Fallita
                            </span>
                          </>
                        )}
                      </div>

                      {validationResult.summary && (
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              Entry totali:
                            </span>{" "}
                            <Badge variant="secondary">
                              {validationResult.summary.totalEntries}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Valide:
                            </span>{" "}
                            <Badge variant="default">
                              {validationResult.summary.validEntries}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Saltate:
                            </span>{" "}
                            <Badge variant="outline">
                              {validationResult.summary.skippedEntries}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {validationResult.summary?.teams &&
                        validationResult.summary.teams.length > 0 && (
                          <div className="mt-3">
                            <span className="text-sm text-muted-foreground">
                              Team trovati:{" "}
                            </span>
                            <span className="text-sm font-medium">
                              {validationResult.summary.teams.join(", ")}
                            </span>
                          </div>
                        )}

                      {validationResult.errors.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">
                            Errori:
                          </p>
                          <ul className="list-inside list-disc text-sm text-red-600 dark:text-red-400">
                            {validationResult.errors.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {validationResult.warnings.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                            Warning:
                          </p>
                          <ul className="list-inside list-disc text-sm text-amber-600 dark:text-amber-400">
                            {validationResult.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Risultato Import */}
                  {importResult?.success && (
                    <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
                      <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        Import Completato!
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div>
                          Team importati:{" "}
                          <Badge>{importResult.teamsImported}</Badge>
                        </div>
                        <div>
                          Giocatori importati:{" "}
                          <Badge>{importResult.playersImported}</Badge>
                        </div>
                      </div>
                      {importResult.summary && (
                        <div className="mt-3">
                          <p className="text-sm font-medium">Riepilogo:</p>
                          <ul className="mt-1 space-y-1 text-sm">
                            {importResult.summary.map((team, i) => (
                              <li key={i}>
                                <span className="font-medium">{team.team}</span>
                                : {team.players} giocatori, {team.totalSpent}{" "}
                                crediti spesi
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Note */}
                  <div className="space-y-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    <p className="font-medium">⚠️ Note Importanti:</p>
                    <ul className="list-inside list-disc space-y-1">
                      <li>
                        I nomi squadra nel CSV devono corrispondere ai{" "}
                        <code>manager_team_name</code> dei partecipanti.
                      </li>
                      <li>
                        L&apos;import sovrascrive completamente le rose
                        esistenti.
                      </li>
                      <li>
                        Il budget viene ricalcolato: iniziale − totale speso.
                      </li>
                      <li>
                        Giocatori non trovati nel catalogo vengono saltati.
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
