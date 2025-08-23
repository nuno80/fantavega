"use client";

import { X } from "lucide-react";

import { SearchFilters } from "@/app/players/PlayerSearchInterface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlayerAdvancedFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTeams: string[];
}

export function PlayerAdvancedFilters({
  filters,
  onFiltersChange,
  availableTeams,
}: PlayerAdvancedFiltersProps) {
  const roles = [
    { value: "P", label: "Portiere" },
    { value: "D", label: "Difensore" },
    { value: "C", label: "Centrocampista" },
    { value: "A", label: "Attaccante" },
  ];

  const auctionStatuses = [
    { value: "no_auction", label: "Nessuna Asta" },
    { value: "active_auction", label: "Asta Attiva" },
    { value: "assigned", label: "Assegnato" },
  ];

  const timeRanges = [
    { value: "less_1h", label: "< 1 ora" },
    { value: "1_6h", label: "1-6 ore" },
    { value: "6_24h", label: "6-24 ore" },
    { value: "more_24h", label: "> 24 ore" },
  ];

  const handleRoleToggle = (role: string) => {
    const newRoles = filters.roles.includes(role)
      ? filters.roles.filter((r) => r !== role)
      : [...filters.roles, role];
    onFiltersChange({ ...filters, roles: newRoles });
  };

  const handleAuctionStatusToggle = (status: string) => {
    const newStatuses = filters.auctionStatus.includes(status)
      ? filters.auctionStatus.filter((s) => s !== status)
      : [...filters.auctionStatus, status];
    onFiltersChange({ ...filters, auctionStatus: newStatuses });
  };

  const handleTimeRangeToggle = (range: string) => {
    const newRanges = filters.timeRemaining.includes(range)
      ? filters.timeRemaining.filter((r) => r !== range)
      : [...filters.timeRemaining, range];
    onFiltersChange({ ...filters, timeRemaining: newRanges });
  };

  const handleTeamSelect = (team: string) => {
    if (team === "all") {
      onFiltersChange({ ...filters, teams: [] });
    } else {
      const newTeams = filters.teams.includes(team)
        ? filters.teams.filter((t) => t !== team)
        : [...filters.teams, team];
      onFiltersChange({ ...filters, teams: newTeams });
    }
  };

  const clearAllFilters = () => {
    onFiltersChange({
      searchTerm: filters.searchTerm, // Keep search term
      roles: [],
      teams: [],
      auctionStatus: [],
      timeRemaining: [],
      showAssigned: true,
      isStarter: false,
      isFavorite: false,
      hasIntegrity: false,
      hasFmv: false,
    });
  };

  const activeFiltersCount =
    filters.roles.length +
    filters.teams.length +
    filters.auctionStatus.length +
    filters.timeRemaining.length +
    (!filters.showAssigned ? 1 : 0) +
    (filters.isStarter ? 1 : 0) +
    (filters.isFavorite ? 1 : 0) +
    (filters.hasIntegrity ? 1 : 0) +
    (filters.hasFmv ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-end">
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {activeFiltersCount} filtri attivi
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-6 px-2"
              >
                <X className="mr-1 h-3 w-3" />
                Pulisci
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Colonna Sinistra: Ruolo e Squadra */}
          <div className="space-y-4">
            {/* Role Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Ruolo</Label>
              <div className="flex flex-wrap gap-3">
                {roles.map((role) => (
                  <div key={role.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role.value}`}
                      checked={filters.roles.includes(role.value)}
                      onCheckedChange={() => handleRoleToggle(role.value)}
                    />
                    <Label
                      htmlFor={`role-${role.value}`}
                      className="cursor-pointer text-sm font-normal"
                    >
                      {role.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Squadra</Label>
              <Select onValueChange={handleTeamSelect}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      filters.teams.length === 0
                        ? "Tutte le squadre"
                        : `${filters.teams.length} squadre selezionate`
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le squadre</SelectItem>
                  {availableTeams.map((team) => (
                    <SelectItem key={team} value={team}>
                      {team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.teams.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {filters.teams.map((team) => (
                    <Badge
                      key={team}
                      variant="secondary"
                      className="cursor-pointer text-xs"
                      onClick={() => handleTeamSelect(team)}
                    >
                      {team}
                      <X className="ml-1 h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Colonna Destra: Stato Asta e Giocatori Assegnati */}
          <div className="space-y-4">
            {/* Auction Status Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Stato Asta</Label>
              <div className="flex flex-col space-y-2">
                {auctionStatuses.map((status) => (
                  <div
                    key={status.value}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`status-${status.value}`}
                      checked={filters.auctionStatus.includes(status.value)}
                      onCheckedChange={() =>
                        handleAuctionStatusToggle(status.value)
                      }
                    />
                    <Label
                      htmlFor={`status-${status.value}`}
                      className="cursor-pointer text-sm font-normal"
                    >
                      {status.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Show Assigned Toggle */}
            <div className="flex items-center space-x-2 pt-4">
              <Checkbox
                id="show-assigned"
                checked={filters.showAssigned}
                onCheckedChange={(checked) =>
                  onFiltersChange({ ...filters, showAssigned: !!checked })
                }
              />
              <Label
                htmlFor="show-assigned"
                className="cursor-pointer text-sm font-normal"
              >
                Mostra giocatori già assegnati
              </Label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-2">
          {/* Time Remaining Filter */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tempo Rimanente</Label>
            <div className="grid grid-cols-2 gap-2">
              {timeRanges.map((range) => (
                <div key={range.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`time-${range.value}`}
                    checked={filters.timeRemaining.includes(range.value)}
                    onCheckedChange={() => handleTimeRangeToggle(range.value)}
                  />
                  <Label
                    htmlFor={`time-${range.value}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {range.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Player Icons Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Caratteristiche Giocatore
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-starter"
                  checked={filters.isStarter}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, isStarter: !!checked })
                  }
                />
                <Label
                  htmlFor="filter-starter"
                  className="cursor-pointer text-sm font-normal"
                >
                  Titolare
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-favorite"
                  checked={filters.isFavorite}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, isFavorite: !!checked })
                  }
                />
                <Label
                  htmlFor="filter-favorite"
                  className="cursor-pointer text-sm font-normal"
                >
                  Preferito
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-integrity"
                  checked={filters.hasIntegrity}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, hasIntegrity: !!checked })
                  }
                />
                <Label
                  htmlFor="filter-integrity"
                  className="cursor-pointer text-sm font-normal"
                >
                  Integrità
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="filter-fmv"
                  checked={filters.hasFmv}
                  onCheckedChange={(checked) =>
                    onFiltersChange({ ...filters, hasFmv: !!checked })
                  }
                />
                <Label
                  htmlFor="filter-fmv"
                  className="cursor-pointer text-sm font-normal"
                >
                  FMV
                </Label>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
