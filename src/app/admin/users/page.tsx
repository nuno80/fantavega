// src/app/admin/users/page.tsx v.1.1
// Pagina di gestione utenti con layout corretto e stili theme-aware.

"use client";

// 1. Importazioni (inclusa una Navbar, assumendo che esista)
import { useEffect, useState } from "react";

import { toast } from "sonner";

import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { Navbar } from "@/components/navbar";
// Assumiamo esista una Navbar
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserWithLeagueDetails } from "@/lib/db/services/user.service";

// 2. Componente (logica invariata)
export default function AdminUserManagement() {
  const [users, setUsers] = useState<UserWithLeagueDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    // ... la tua funzione loadUsers rimane identica ...
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/get-users");
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage);
      toast.error("Errore nel caricamento", { description: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  async function updateUserRole(userId: string, role: string) {
    // ... la tua funzione updateUserRole rimane identica ...
    if (!role) return;
    toast.info("Aggiornamento ruolo in corso...");
    try {
      const response = await fetch("/api/admin/set-user-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (response.ok) {
        toast.success("Ruolo aggiornato con successo!");
        loadUsers();
      } else {
        const errorData = await response.json().catch(() => ({
          message: `Failed to update role: ${response.statusText}`,
        }));
        throw new Error(errorData.message);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      toast.error("Errore nell'aggiornamento", { description: errorMessage });
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // 3. JSX Ristrutturato
  return (
    // Contenitore principale che imposta il layout e il colore di sfondo corretto dal tema
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <h1 className="text-3xl font-bold text-foreground">Gestione Utenti</h1>

        <AdminQuickActions />

        {/* Gestione degli stati di caricamento ed errore */}
        {loading && (
          <p className="text-muted-foreground">
            Caricamento utenti in corso...
          </p>
        )}
        {error && (
          <div className="text-red-600">
            <p>Errore nel caricamento degli utenti:</p>
            <p>{error}</p>
          </div>
        )}

        {/* Contenuto principale (la tabella) visibile solo se non in caricamento e senza errori */}
        {!loading && !error && (
          // Rimosso bg-white per permettere al tema di funzionare correttamente
          <div className="rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Leghe</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="text-right">Azione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length > 0 ? (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.primaryEmail}
                      </TableCell>
                      <TableCell>
                        {user.firstName} {user.lastName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.leagues.length > 0 ? (
                            user.leagues.map((league) => (
                              <Badge key={league.id} variant="secondary">
                                {league.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Nessuna
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {user.role || "Manager"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          defaultValue={user.role || "manager"}
                          onValueChange={(value: string) =>
                            updateUserRole(user.id, value)
                          }
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Cambia Ruolo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Nessun utente trovato.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
