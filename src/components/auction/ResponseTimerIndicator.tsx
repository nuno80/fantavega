"use client";

import { useEffect, useRef, useState } from "react";

import { Timer } from "lucide-react";

export interface ResponseTimerItem {
  auctionId: number;
  playerId: number;
  playerName: string;
  deadline: number;
}

interface ResponseTimerIndicatorProps {
  timers: ResponseTimerItem[];
  onExpired?: () => void;
}

export function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const calculateRemaining = (deadline: number) =>
  Math.max(0, deadline - Math.floor(Date.now() / 1000));

// Il tooltip elenca tutti i timer attivi (playerName + tempo).
const buildTooltip = (timers: ResponseTimerItem[], nowSeconds: number) =>
  timers
    .map(
      (timer) =>
        `${timer.playerName} — ${formatTimer(Math.max(0, timer.deadline - nowSeconds))}`
    )
    .join("\n");

export function ResponseTimerIndicator({ timers, onExpired }: ResponseTimerIndicatorProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // Selezione autonoma del timer più urgente: chi chiama non deve ordinare.
  const sorted = [...timers].sort((a, b) => a.deadline - b.deadline);
  const primary = sorted[0];

  // Un solo interval per tutti i timer: il tick aggiorna `now` e ogni
  // rendering ricalcola i secondi da `deadline - now` (clock-safe: resiste a
  // standby, interval sospesi e riallineamenti realtime). L'interval vive
  // finché il componente è montato e c'è almeno un timer.
  const primaryKey = primary
    ? `${primary.auctionId}:${primary.deadline}`
    : null;
  useEffect(() => {
    if (!primaryKey) return;
    setNow(Math.floor(Date.now() / 1000)); // riallinea subito al mount/change
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [primaryKey]);

  // Scadenza: notifica il parent UNA sola volta per timer (ref chiave su
  // auctionId:deadline, così un cambio di timer o un refresh reale lo
  // ri-arma solo se la deadline cambia davvero).
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!primary) return;
    if (primary.deadline <= now) {
      const key = `${primary.auctionId}:${primary.deadline}`;
      if (notifiedRef.current !== key) {
        notifiedRef.current = key;
        onExpiredRef.current?.();
      }
    }
  }, [primary, now]);

  if (!primary) return null;

  const remaining = calculateRemaining(primary.deadline);
  const isExpired = remaining <= 0;
  const isLowTime = remaining > 0 && remaining <= 300; // ultimi 5 minuti

  const colorClass = isExpired
    ? "text-red-500"
    : "text-emerald-400";
  const pulseClass = isLowTime && !isExpired ? "animate-pulse" : "";

  return (
    <span
      className={`flex flex-shrink-0 items-center gap-1 font-mono text-xs font-bold tabular-nums ${colorClass} ${pulseClass}`}
      title={buildTooltip(sorted, now)}
    >
      <Timer className="h-4 w-4 flex-shrink-0 text-emerald-400" />
      {formatTimer(remaining)}
      {sorted.length > 1 && (
        <span className="rounded bg-emerald-500/15 px-1 text-[10px]">
          +{sorted.length - 1}
        </span>
      )}
    </span>
  );
}
