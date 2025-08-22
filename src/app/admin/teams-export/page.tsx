"use client";

import { redirect } from "next/navigation";
import { useEffect, useState } from "react";

import { useUser } from "@clerk/nextjs";
import { Download, FileCode, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";

import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface League {
  id: number;
  name: string;
  status: string;
  league_type: string;
}

type ExportFormat = "csv" | "excel" | "custom";

export default function TeamsExportPage() {
  const { user, isLoaded } = useUser();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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
      } catch (error) {
        toast.error("Errore nel caricamento delle leghe");
      } finally {
        setIsLoading(false);
      }
    };
    if (user) fetchLeagues();
  }, [user]);

  const handleExport = async () => {
    if (!selectedLeagueId) {
      toast.error("Seleziona una lega prima di esportare.");
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/admin/teams-export?leagueId=${selectedLeagueId}&format=${selectedFormat}`
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
        <h1 className="text-3xl font-bold text-foreground">
          Esportazione Squadre
        </h1>
        <div className="mx-auto w-full lg:w-5/6">
          <AdminQuickActions />
        </div>
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Configura Esportazione
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lega</label>
                  <Select
                    value={selectedLeagueId}
                    onValueChange={setSelectedLeagueId}
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
                    onValueChange={(v) => setSelectedFormat(v as ExportFormat)}
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

              <div className="pt-4">
                <Button
                  onClick={handleExport}
                  disabled={!selectedLeagueId || isExporting}
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
              </div>

              <div className="space-y-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <p className="font-medium">Descrizione Formati:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    <b>CSV Standard:</b> File di testo con valori separati da
                    virgola.
                  </li>
                  <li>
                    <b>Excel:</b> File standard di Microsoft Excel, comodo per
                    analisi.
                  </li>
                  <li>
                    <b>Testo Personalizzato:</b> Formato speciale{" "}
                    <code>NomeSquadraIDGiocatorePrezzo</code> con separatore{" "}
                    <code>$</code> tra le squadre.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
