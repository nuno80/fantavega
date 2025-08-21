"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

interface PlayerSearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export function PlayerSearchBar({
  searchTerm,
  onSearchChange,
}: PlayerSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Cerca per nome giocatore o squadra..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-12 pl-10 text-base"
      />
    </div>
  );
}
