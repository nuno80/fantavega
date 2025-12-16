'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { toast } from 'sonner';

interface UseInactivityRedirectOptions {
  /** Timeout in secondi prima del redirect (default: 30) */
  timeoutSeconds?: number;
  /** Secondi prima del timeout per mostrare il warning (default: 10) */
  warningSeconds?: number;
  /** Path di redirect (default: '/') */
  redirectPath?: string;
  /** Abilita/disabilita il sistema (default: true) */
  enabled?: boolean;
}

/**
 * Hook che monitora l'inattività dell'utente e fa redirect dopo un timeout.
 *
 * Monitora: mousemove, mousedown, keydown, scroll, touchstart
 *
 * @example
 * // Uso base - 30 sec timeout
 * useInactivityRedirect();
 *
 * // Uso con parametri custom
 * useInactivityRedirect({ timeoutSeconds: 60, warningSeconds: 15 });
 */
export function useInactivityRedirect(options: UseInactivityRedirectOptions = {}) {
  const {
    timeoutSeconds = 30,
    warningSeconds = 10,
    redirectPath = '/',
    enabled = true,
  } = options;

  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningShownRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  // Cleanup dei timeout
  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  // Reset del timer di inattività
  const resetTimer = useCallback(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    clearTimeouts();

    // Timer per il warning
    warningTimeoutRef.current = setTimeout(() => {
      warningShownRef.current = true;
      toast.warning(
        `Verrai reindirizzato tra ${warningSeconds} secondi per inattività`,
        {
          duration: warningSeconds * 1000,
          id: 'inactivity-warning', // ID univoco per evitare duplicati
        }
      );
    }, (timeoutSeconds - warningSeconds) * 1000);

    // Timer per il redirect
    timeoutRef.current = setTimeout(async () => {
      toast.dismiss('inactivity-warning');
      toast.info('Sessione sospesa per inattività. I timer ripartiranno quando tornerai.', {
        duration: 5000,
      });

      // Chiudi la sessione nel backend PRIMA del redirect
      // IMPORTANTE: Usa fetch con credentials per inviare i cookie di auth Clerk
      try {
        const response = await fetch('/api/user/set-inactive', {
          method: 'POST',
          credentials: 'include', // Include auth cookies
        });
        if (response.ok) {
          console.log('[INACTIVITY] Session closed successfully');
        } else {
          console.error('[INACTIVITY] Failed to close session:', response.status);
        }
      } catch (error) {
        console.error('[INACTIVITY] Error closing session:', error);
      }

      router.push(redirectPath as '/');
    }, timeoutSeconds * 1000);
  }, [enabled, timeoutSeconds, warningSeconds, redirectPath, router, clearTimeouts]);

  // Setup degli event listener
  useEffect(() => {
    if (!enabled) return;

    // Eventi da monitorare
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    // Handler con throttle leggero per evitare chiamate eccessive
    let throttleTimeout: NodeJS.Timeout | null = null;
    const handleActivity = () => {
      if (throttleTimeout) return;

      throttleTimeout = setTimeout(() => {
        throttleTimeout = null;
      }, 100); // Throttle di 100ms

      resetTimer();
    };

    // Aggiungi listener
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Inizializza il timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimeouts();
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
    };
  }, [enabled, resetTimer, clearTimeouts]);

  // Ritorna info utili per debug/UI
  return {
    resetTimer,
    lastActivityTime: lastActivityRef.current,
  };
}
