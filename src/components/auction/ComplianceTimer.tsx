'use client';

import { useState, useEffect } from 'react';

interface ComplianceTimerProps {
  timerStartTimestamp: number | null;
}

const GRACE_PERIOD_SECONDS = 3600; // 1 hour
const PENALTY_INTERVAL_SECONDS = 3600; // 1 hour between penalties

export function ComplianceTimer({ timerStartTimestamp }: ComplianceTimerProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (timerStartTimestamp === null) {
      setTimeLeft('');
      return;
    }

    const calculateTimeLeft = () => {
      const now = Math.floor(Date.now() / 1000);
      const gracePeriodEnd = timerStartTimestamp + GRACE_PERIOD_SECONDS;
      
      // If we're still in the initial grace period
      if (now < gracePeriodEnd) {
        const remainingSeconds = gracePeriodEnd - now;
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        setTimeLeft(
          `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
        return;
      }
      
      // Grace period has ended - calculate time until next penalty
      // Timer now shows countdown to next hourly penalty
      const hoursSinceGracePeriod = Math.floor((now - gracePeriodEnd) / PENALTY_INTERVAL_SECONDS);
      const nextPenaltyTime = gracePeriodEnd + ((hoursSinceGracePeriod + 1) * PENALTY_INTERVAL_SECONDS);
      const remainingSeconds = Math.max(0, nextPenaltyTime - now);
      
      if (remainingSeconds === 0) {
        // This should rarely happen due to timing, but just in case
        setTimeLeft('00:00');
        return;
      }
      
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      
      setTimeLeft(
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    // Calculate immediately on mount
    calculateTimeLeft();

    // Then update every second
    const intervalId = setInterval(calculateTimeLeft, 1000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [timerStartTimestamp]);

  if (!timeLeft) {
    return null;
  }

  return <span className="text-xs font-mono text-yellow-500">{timeLeft}</span>;
}
