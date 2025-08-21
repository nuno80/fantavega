"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface AuctionTimerProps {
  scheduledEndTime: number;
  status: string;
  onTimeExpired?: () => void;
}

export function AuctionTimer({
  scheduledEndTime,
  status,
  onTimeExpired,
}: AuctionTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (status !== "active") return;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, scheduledEndTime - now);

      setTimeRemaining(remaining);

      if (remaining === 0 && !isExpired) {
        setIsExpired(true);
        onTimeExpired?.();
      }
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [scheduledEndTime, status, isExpired, onTimeExpired]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const getTimerColor = () => {
    if (timeRemaining > 300) return "text-green-600"; // > 5 minutes
    if (timeRemaining > 60) return "text-yellow-600"; // > 1 minute
    return "text-red-600"; // < 1 minute
  };

  const getProgressValue = () => {
    // Assuming auction duration is 24 hours (86400 seconds)
    const totalDuration = 86400;
    const elapsed = totalDuration - timeRemaining;
    return Math.min(100, (elapsed / totalDuration) * 100);
  };

  if (status !== "active") {
    return (
      <div className="p-4 text-center">
        <Badge variant={status === "sold" ? "default" : "secondary"}>
          {status === "sold" ? "Asta Conclusa" : "Asta Non Attiva"}
        </Badge>
      </div>
    );
  }

  if (isExpired || timeRemaining === 0) {
    return (
      <div className="p-4 text-center">
        <Badge variant="destructive">Tempo Scaduto</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-4">
      <div className="text-center">
        <p className="mb-1 text-sm text-muted-foreground">Tempo Rimanente</p>
        <p className={`font-mono text-2xl font-bold ${getTimerColor()}`}>
          {formatTime(timeRemaining)}
        </p>
      </div>

      <Progress value={getProgressValue()} className="h-2" />

      {timeRemaining <= 300 && (
        <div className="text-center">
          <Badge variant="destructive" className="animate-pulse">
            Asta in Scadenza!
          </Badge>
        </div>
      )}
    </div>
  );
}
