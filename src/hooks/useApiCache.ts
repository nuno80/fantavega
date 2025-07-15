// src/hooks/useApiCache.ts
// Hook personalizzato per caching intelligente delle API con SWR

import useSWR, { SWRConfiguration } from 'swr';
import { useCallback } from 'react';

// Fetcher function per SWR
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Configurazione di default per SWR
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30000, // 30 secondi
  errorRetryCount: 3,
  errorRetryInterval: 5000,
};

// Hook per dati delle leghe dell'utente
export function useUserLeagues(userId?: string) {
  const { data, error, mutate, isLoading } = useSWR(
    userId ? '/api/user/leagues' : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 60000, // Refresh ogni minuto
    }
  );

  return {
    leagues: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per dati del budget della lega
export function useLeagueBudget(leagueId?: number) {
  const { data, error, mutate, isLoading } = useSWR(
    leagueId ? `/api/leagues/${leagueId}/budget` : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 30000, // Refresh ogni 30 secondi
    }
  );

  return {
    budget: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per manager della lega
export function useLeagueManagers(leagueId?: number) {
  const { data, error, mutate, isLoading } = useSWR(
    leagueId ? `/api/leagues/${leagueId}/managers` : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 120000, // Refresh ogni 2 minuti (dati meno volatili)
    }
  );

  return {
    managers: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per asta corrente
export function useCurrentAuction(leagueId?: number) {
  const { data, error, mutate, isLoading } = useSWR(
    leagueId ? `/api/leagues/${leagueId}/current-auction` : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 10000, // Refresh ogni 10 secondi (dati molto volatili)
    }
  );

  return {
    auction: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per cronologia offerte
export function useBidHistory(leagueId?: number, playerId?: number) {
  const { data, error, mutate, isLoading } = useSWR(
    leagueId && playerId ? `/api/leagues/${leagueId}/players/${playerId}/bids` : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 15000, // Refresh ogni 15 secondi
    }
  );

  return {
    bids: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per lista giocatori con caching intelligente
export function usePlayers(filters?: Record<string, any>) {
  // Crea una chiave di cache basata sui filtri
  const cacheKey = filters ? `/api/players?${new URLSearchParams(filters).toString()}` : '/api/players';
  
  const { data, error, mutate, isLoading } = useSWR(
    cacheKey,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 300000, // Refresh ogni 5 minuti (dati statici)
      dedupingInterval: 60000, // 1 minuto di deduplicazione
    }
  );

  return {
    players: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per stati asta utente
export function useUserAuctionStates(userId?: string) {
  const { data, error, mutate, isLoading } = useSWR(
    userId ? '/api/user/auction-states' : null,
    fetcher,
    {
      ...defaultConfig,
      refreshInterval: 20000, // Refresh ogni 20 secondi
    }
  );

  return {
    auctionStates: data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook generico per API con caching personalizzato
export function useApiData<T = any>(
  url: string | null,
  config?: SWRConfiguration
) {
  const { data, error, mutate, isLoading } = useSWR<T>(
    url,
    fetcher,
    {
      ...defaultConfig,
      ...config,
    }
  );

  return {
    data,
    isLoading,
    isError: error,
    refresh: mutate,
  };
}

// Hook per invalidare cache multiple
export function useCacheInvalidation() {
  const invalidateUserData = useCallback((userId: string) => {
    // Invalida tutte le cache relative all'utente
    mutate((key) => typeof key === 'string' && key.includes('/api/user/'));
    mutate((key) => typeof key === 'string' && key.includes('/api/user/auction-states'));
  }, []);

  const invalidateLeagueData = useCallback((leagueId: number) => {
    // Invalida tutte le cache relative alla lega
    mutate((key) => typeof key === 'string' && key.includes(`/api/leagues/${leagueId}`));
  }, []);

  const invalidateAuctionData = useCallback((leagueId: number, playerId?: number) => {
    // Invalida cache specifiche dell'asta
    mutate(`/api/leagues/${leagueId}/current-auction`);
    if (playerId) {
      mutate(`/api/leagues/${leagueId}/players/${playerId}/bids`);
    }
  }, []);

  return {
    invalidateUserData,
    invalidateLeagueData,
    invalidateAuctionData,
  };
}

// Funzione helper per pre-caricare dati
export function preloadApiData(url: string) {
  return mutate(url, fetcher(url), false);
}

// Re-export mutate per uso diretto
export { mutate } from 'swr';