"use client";

import { useMemo } from "react";
import { FixedSizeList as List } from 'react-window';
import { PlayerSearchCard } from "./PlayerSearchCard";
import { type PlayerWithAuctionStatus } from "@/app/players/PlayerSearchInterface";

interface VirtualizedPlayerSearchResultsProps {
  players: PlayerWithAuctionStatus[];
  onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;
  onStartAuction: (playerId: number) => void;
  onTogglePlayerIcon?: (playerId: number, iconType: 'isStarter' | 'isFavorite' | 'integrityValue' | 'hasFmv', value: boolean | number) => void;
  userRole: string;
  userId: string;
  leagueId?: number;
  height?: number;
  itemHeight?: number;
  columnsPerRow?: number;
}

interface PlayerRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    players: PlayerWithAuctionStatus[];
    onBidOnPlayer: (player: PlayerWithAuctionStatus) => void;
    onStartAuction: (playerId: number) => void;
    onTogglePlayerIcon?: (playerId: number, iconType: 'isStarter' | 'isFavorite' | 'integrityValue' | 'hasFmv', value: boolean | number) => void;
    userRole: string;
    userId: string;
    leagueId?: number;
    columnsPerRow: number;
  };
}

// Componente per renderizzare una riga di giocatori
function PlayerRow({ index, style, data }: PlayerRowProps) {
  const { 
    players, 
    onBidOnPlayer, 
    onStartAuction, 
    onTogglePlayerIcon, 
    userRole, 
    userId, 
    leagueId, 
    columnsPerRow 
  } = data;

  const startIndex = index * columnsPerRow;
  const endIndex = Math.min(startIndex + columnsPerRow, players.length);
  const rowPlayers = players.slice(startIndex, endIndex);

  return (
    <div style={style} className="flex gap-4 px-4">
      {rowPlayers.map((player) => (
        <div key={player.id} className="flex-1 min-w-0">
          <PlayerSearchCard
            player={player}
            onBidOnPlayer={onBidOnPlayer}
            onStartAuction={onStartAuction}
            onTogglePlayerIcon={onTogglePlayerIcon}
            userRole={userRole}
            userId={userId}
            leagueId={leagueId}
          />
        </div>
      ))}
      {/* Riempi spazi vuoti se necessario */}
      {Array.from({ length: columnsPerRow - rowPlayers.length }).map((_, i) => (
        <div key={`empty-${i}`} className="flex-1 min-w-0" />
      ))}
    </div>
  );
}

export function VirtualizedPlayerSearchResults({
  players,
  onBidOnPlayer,
  onStartAuction,
  onTogglePlayerIcon,
  userRole,
  userId,
  leagueId,
  height = 600,
  itemHeight = 220,
  columnsPerRow = 4,
}: VirtualizedPlayerSearchResultsProps) {
  
  // Calcola il numero di righe necessarie
  const rowCount = useMemo(() => {
    return Math.ceil(players.length / columnsPerRow);
  }, [players.length, columnsPerRow]);

  // Determina se usare virtual scrolling (soglia: 100+ giocatori)
  const shouldUseVirtualScrolling = players.length > 100;

  // Dati da passare al componente PlayerRow
  const itemData = useMemo(() => ({
    players,
    onBidOnPlayer,
    onStartAuction,
    onTogglePlayerIcon,
    userRole,
    userId,
    leagueId,
    columnsPerRow,
  }), [players, onBidOnPlayer, onStartAuction, onTogglePlayerIcon, userRole, userId, leagueId, columnsPerRow]);

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="text-xl font-semibold mb-2">Nessun giocatore trovato</h3>
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
        {shouldUseVirtualScrolling && (
          <div className="text-sm text-muted-foreground">
            Virtual scrolling attivo per ottimizzare le performance
          </div>
        )}
      </div>
      
      {shouldUseVirtualScrolling ? (
        // Usa virtual scrolling per liste grandi
        <div className="border rounded-lg">
          <List
            height={height}
            itemCount={rowCount}
            itemSize={itemHeight}
            itemData={itemData}
            className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          >
            {PlayerRow}
          </List>
        </div>
      ) : (
        // Rendering normale per liste piccole
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {players.map((player) => (
            <PlayerSearchCard
              key={player.id}
              player={player}
              onBidOnPlayer={onBidOnPlayer}
              onStartAuction={onStartAuction}
              onTogglePlayerIcon={onTogglePlayerIcon}
              userRole={userRole}
              userId={userId}
              leagueId={leagueId}
            />
          ))}
        </div>
      )}
    </div>
  );
}