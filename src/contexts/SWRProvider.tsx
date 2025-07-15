"use client";

import { SWRConfig } from 'swr';
import { ReactNode } from 'react';

// Configurazione globale per SWR
const swrConfig = {
  // Fetcher di default
  fetcher: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      // Attach extra info to the error object
      (error as any).info = await response.json();
      (error as any).status = response.status;
      throw error;
    }
    return response.json();
  },
  
  // Configurazioni globali
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30000, // 30 secondi
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  
  // Gestione errori globale
  onError: (error: any, key: string) => {
    console.error('SWR Error:', { key, error });
    
    // Log errori critici
    if (error.status === 500) {
      console.error('Server error for:', key);
    }
    
    // Gestione errori di autenticazione
    if (error.status === 401) {
      console.warn('Authentication error for:', key);
      // Potresti voler reindirizzare al login qui
    }
  },
  
  // Callback per successo
  onSuccess: (data: any, key: string) => {
    // Log solo per debug in development
    if (process.env.NODE_ENV === 'development') {
      console.log('SWR Success:', { key, dataLength: Array.isArray(data) ? data.length : 'object' });
    }
  },
  
  // Configurazione cache
  provider: () => new Map(),
  
  // Configurazioni specifiche per tipo di dato
  refreshInterval: 0, // Disabilitato di default, abilitato per endpoint specifici
  
  // Configurazione per slow connection
  loadingTimeout: 10000, // 10 secondi
  
  // Configurazione per retry
  shouldRetryOnError: (error: any) => {
    // Non fare retry per errori 4xx (client errors)
    return error.status >= 500;
  },
};

interface SWRProviderProps {
  children: ReactNode;
}

export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig value={swrConfig}>
      {children}
    </SWRConfig>
  );
}