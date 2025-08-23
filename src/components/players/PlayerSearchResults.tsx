"use client";

import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";

import { PlayerSearchCard } from "./PlayerSearchCard";

interface PlayerSearchResultsProps {
  players: PlayerWithAuctionStatus[];
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;

  onStartAuction: (player: PlayerWithAuctionStatus) => void;
  onTogglePlayerIcon?: (
    playerId: number,
    iconType: "isStarter" | "isFavorite" | "integrityValue" | "hasFmv",
    value: boolean | number
  ) => void;
  userRole: string;
  userId: string;
  leagueId?: number;
}

export function PlayerSearchResults({
  players,
  onBidOnPlayer,
  onStartAuction: _onStartAuction,
  onTogglePlayerIcon,
  userRole,
  userId,
  leagueId,
}: PlayerSearchResultsProps) {
  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 text-6xl">🔍</div>
        <h3 className="mb-2 text-xl font-semibold">Nessun giocatore trovato</h3>
        <p className="text-muted-foreground">
          Prova a modificare i filtri di ricerca per trovare più giocatori.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Risultati ({players.length} giocatori)
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {players.map((player) => (
          <PlayerSearchCard
            key={player.id}
            player={player}
            onBidOnPlayer={onBidOnPlayer}
            onTogglePlayerIcon={onTogglePlayerIcon}
            userRole={userRole}
            userId={userId}
            leagueId={leagueId}
          />
        ))}
      </div>
    </div>
  );
}
