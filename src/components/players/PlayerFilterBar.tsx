"use client";

import { Filter, X } from "lucide-react";
import { useState } from "react";

import { SearchFilters } from "@/app/players/PlayerSearchInterface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface PlayerFilterBarProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTeams: string[];
}

export function PlayerFilterBar({
  filters,
  onFiltersChange,
  availableTeams,
}: PlayerFilterBarProps) {
  const [isRolePopoverOpen, setIsRolePopoverOpen] = useState(false);
  const [isTeamPopoverOpen, setIsTeamPopoverOpen] = useState(false);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);

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
    const newTeams = filters.teams.includes(team)
      ? filters.teams.filter((t) => t !== team)
      : [...filters.teams, team];
    onFiltersChange({ ...filters, teams: newTeams });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      searchTerm: filters.searchTerm,
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      {/* Role Filter */}
      <Popover open={isRolePopoverOpen} onOpenChange={setIsRolePopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            Ruolo
            {filters.roles.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                {filters.roles.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-2">
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
        </PopoverContent>
      </Popover>

      {/* Team Filter */}
      <Popover open={isTeamPopoverOpen} onOpenChange={setIsTeamPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            Squadra
            {filters.teams.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                {filters.teams.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Cerca squadra..." />
            <CommandList>
              <CommandEmpty>Nessuna squadra trovata.</CommandEmpty>
              <CommandGroup>
                {availableTeams.map((team) => (
                  <CommandItem
                    key={team}
                    onSelect={() => handleTeamSelect(team)}
                  >
                    <Checkbox
                      checked={filters.teams.includes(team)}
                      className="mr-2"
                    />
                    {team}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Status Filter */}
      <Popover open={isStatusPopoverOpen} onOpenChange={setIsStatusPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            Stato
            {filters.auctionStatus.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                {filters.auctionStatus.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-2">
            {auctionStatuses.map((status) => (
              <div key={status.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`status-${status.value}`}
                  checked={filters.auctionStatus.includes(status.value)}
                  onCheckedChange={() => handleAuctionStatusToggle(status.value)}
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
        </PopoverContent>
      </Popover>

      {/* More Filters (Sheet) */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Filter className="mr-1 h-3 w-3" />
            Altri Filtri
            {(filters.timeRemaining.length > 0 ||
              filters.isStarter ||
              filters.isFavorite ||
              filters.hasIntegrity ||
              filters.hasFmv ||
              !filters.showAssigned) && (
                <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                  {filters.timeRemaining.length +
                    (filters.isStarter ? 1 : 0) +
                    (filters.isFavorite ? 1 : 0) +
                    (filters.hasIntegrity ? 1 : 0) +
                    (filters.hasFmv ? 1 : 0) +
                    (!filters.showAssigned ? 1 : 0)}
                </Badge>
              )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filtri Avanzati</SheetTitle>
            <SheetDescription>
              Configura filtri aggiuntivi per la ricerca dei giocatori.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Time Remaining */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tempo Rimanente</Label>
              <div className="space-y-2">
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

            {/* Player Characteristics */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Caratteristiche Giocatore
              </Label>
              <div className="space-y-2">
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

            {/* Show Assigned */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
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
        </SheetContent>
      </Sheet>

      {/* Active Filters Badge & Clear Button */}
      {activeFiltersCount > 0 && (
        <>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
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
        </>
      )}
    </div>
  );
}
