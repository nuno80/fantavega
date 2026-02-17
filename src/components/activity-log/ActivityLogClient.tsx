"use client";

// src/components/activity-log/ActivityLogClient.tsx v.1.0
// Componente client per visualizzare il log cronologico delle attività della lega.
// 1. Importazioni
import { useCallback, useEffect, useState } from "react";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Gavel,
  Loader2,
  LogIn,
  LogOut,
  Timer,
  TimerOff,
  Trophy,
  Wallet
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 2. Tipi
interface ActivityEvent {
  id: string;
  timestamp: number;
  event_type: string;
  user_id: string;
  username: string;
  description: string;
  league_id: number;
  details?: Record<string, unknown>;
}

interface LeagueUser {
  id: string;
  username: string;
}

interface ActivityLogResponse {
  events: ActivityEvent[];
  totalCount: number;
  page: number;
  totalPages: number;
  leagueUsers: LeagueUser[];
}

interface ActivityLogClientProps {
  leagueId: number;
  initialMyBiddedPlayers?: boolean;
}

// 3. Configurazione tipi di evento
const EVENT_TYPE_CONFIG: Record<
  string,
  { label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }
> = {
  login: {
    label: "Login",
    description: "Accesso effettuato alla piattaforma",
    icon: LogIn,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  logout: {
    label: "Logout",
    description: "Uscita dalla piattaforma (manuale o scadenza sessione)",
    icon: LogOut,
    color: "text-slate-400",
    bgColor: "bg-slate-400/10",
  },
  bid: {
    label: "Offerta",
    description: "Offerta piazzata per un giocatore",
    icon: Gavel,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  auction_created: {
    label: "Asta Aperta",
    description: "Nuova asta iniziata per un giocatore",
    icon: Clock,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  auction_sold: {
    label: "Asta Conclusa",
    description: "Giocatore assegnato al vincitore dell'asta",
    icon: Trophy,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },

  budget_transaction: {
    label: "Penalità / Budget", // Ex "Transazione"
    description: "Modifica manuale o bonus/malus al budget",
    icon: Wallet,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  timer_activated: {
    label: "Timer",
    description: "Timer di risposta attivato per un utente",
    icon: Timer,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  timer_expired: {
    label: "Timer Rilancio Scaduto", // Ex "Timer Scaduto"
    description: "Tempo scaduto senza risposta dall'utente",
    icon: TimerOff,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  timer_abandoned: {
    label: "Abbandonata",
    description: "Asta abbandonata dall'utente o per inattività",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
};

const ALL_EVENT_TYPES = Object.entries(EVENT_TYPE_CONFIG).map(([key, val]) => ({
  value: key,
  label: val.label,
}));

// 4. Helper per formattare timestamp
function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateForInput(ts: number | null): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateInputToTimestamp(dateStr: string, endOfDay = false): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return Math.floor(date.getTime() / 1000);
}

// 5. Componente Principale
export function ActivityLogClient({ leagueId, initialMyBiddedPlayers = false }: ActivityLogClientProps) {
  // State
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [leagueUsers, setLeagueUsers] = useState<LeagueUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtri
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterEventTypes, setFilterEventTypes] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterMyBiddedPlayers, setFilterMyBiddedPlayers] = useState(initialMyBiddedPlayers);
  const [showFilters, setShowFilters] = useState(initialMyBiddedPlayers);

  // Fetch data
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "50");

      if (filterUserId) params.set("userId", filterUserId);
      if (filterEventTypes.length > 0) params.set("eventType", filterEventTypes.join(","));
      if (filterMyBiddedPlayers) params.set("myBiddedPlayers", "true");

      const dateFromTs = dateInputToTimestamp(filterDateFrom);
      if (dateFromTs) params.set("dateFrom", dateFromTs.toString());

      const dateToTs = dateInputToTimestamp(filterDateTo, true);
      if (dateToTs) params.set("dateTo", dateToTs.toString());

      const response = await fetch(
        `/api/leagues/${leagueId}/activity-log?${params.toString()}`
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Errore ${response.status}`);
      }

      const data: ActivityLogResponse = await response.json();
      setEvents(data.events);
      setTotalCount(data.totalCount);
      setTotalPages(data.totalPages);
      if (data.leagueUsers.length > 0) {
        setLeagueUsers(data.leagueUsers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }, [leagueId, page, filterUserId, filterEventTypes, filterDateFrom, filterDateTo, filterMyBiddedPlayers]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Reset pagina quando i filtri cambiano
  const handleFilterChange = useCallback(() => {
    setPage(1);
  }, []);

  // Toggle per evento tipo (multi-select)
  const toggleEventType = useCallback((eventType: string) => {
    setFilterEventTypes((prev) =>
      prev.includes(eventType)
        ? prev.filter((t) => t !== eventType)
        : [...prev, eventType]
    );
    handleFilterChange();
  }, [handleFilterChange]);

  // Render singolo evento
  const renderEvent = (event: ActivityEvent) => {
    const config = EVENT_TYPE_CONFIG[event.event_type] || {
      label: event.event_type,
      icon: Clock,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    };
    const IconComponent = config.icon;

    return (
      <div
        key={event.id}
        className="flex items-start gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-muted/30"
      >
        {/* Icona tipo evento */}
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bgColor}`}
        >
          <IconComponent className={`h-4 w-4 ${config.color}`} />
        </div>

        {/* Contenuto */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {event.username}
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${config.color} border-current/20`}
            >
              {config.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {event.description}
          </p>
        </div>

        {/* Timestamp */}
        <div className="shrink-0 text-right">
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Activity Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Cronologia completa degli eventi della lega
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtri
          {(filterUserId || filterEventTypes.length > 0 || filterDateFrom || filterDateTo || filterMyBiddedPlayers) && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
              !
            </Badge>
          )}
        </Button>
      </div>

      {/* Pannello Filtri */}
      {showFilters && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Filtra Eventi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Filtro Utente */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Utente
                </label>
                <Select
                  value={filterUserId}
                  onValueChange={(value) => {
                    setFilterUserId(value === "all" ? "" : value);
                    handleFilterChange();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti gli utenti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti gli utenti</SelectItem>
                    {leagueUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Tipo Evento — Multi-Select */}
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Tipi Evento {filterEventTypes.length > 0 && `(${filterEventTypes.length})`}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_EVENT_TYPES.map((t) => {
                    const isSelected = filterEventTypes.includes(t.value);
                    const config = EVENT_TYPE_CONFIG[t.value];
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => toggleEventType(t.value)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${isSelected
                          ? `${config.bgColor} ${config.color} border-current/30 ring-1 ring-current/20`
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filtro Data Da */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Da
                </label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    handleFilterChange();
                  }}
                />
              </div>

              {/* Filtro Data A */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  A
                </label>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    handleFilterChange();
                  }}
                />
              </div>
            </div>

            {/* Filtro: Aste Partecipate (Toggle) */}
            <div className="mt-4 flex items-center space-x-2 border-t pt-4">
              <Button
                variant={filterMyBiddedPlayers ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterMyBiddedPlayers(!filterMyBiddedPlayers);
                  handleFilterChange();
                }}
                className={filterMyBiddedPlayers ? "bg-amber-600 hover:bg-amber-700" : ""}
              >
                <Gavel className="mr-2 h-4 w-4" />
                {filterMyBiddedPlayers ? "Rilanci: ON" : "Rilanci"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Mostra solo eventi relativi ai giocatori per cui hai fatto offerte.
              </span>
            </div>

            {/* Pulsante Reset Filtri */}
            {(filterUserId || filterEventTypes.length > 0 || filterDateFrom || filterDateTo || filterMyBiddedPlayers) && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterUserId("");
                    setFilterEventTypes([]);
                    setFilterDateFrom("");
                    setFilterDateTo("");
                    setFilterMyBiddedPlayers(false);
                    handleFilterChange();
                  }}
                >
                  Resetta Filtri
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
      )
      }

      {/* Contatore risultati */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {totalCount} eventi trovati
          {totalPages > 1 && ` — Pagina ${page} di ${totalPages}`}
        </p>
      </div>

      {/* Lista Eventi */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Caricamento...
              </span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="mb-2 h-6 w-6 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchEvents}
              >
                Riprova
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nessun evento trovato
              </p>
              {(filterUserId || filterEventTypes.length > 0 || filterDateFrom || filterDateTo || filterMyBiddedPlayers) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Prova a modificare i filtri
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {events.map(renderEvent)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginazione */}
      {
        totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Precedente
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Successiva
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )
      }
    </div >
  );
}
